"""Migrate the existing MoonLight event in Google Cloud Shell; dry-run by default.

Uses the signed-in gcloud account without exporting credentials. Existing booking
numbers, access keys, payment states, timestamps, and audit history are preserved.
The old event is retained as a backup with client access disabled by the new rules.
"""

import argparse
import copy
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

PROJECT = 'guiro-534c6'
OLD_DATE = '2026-10-28'
NEW_DATE = '2026-10-29'
OLD_EVENT = f'moonlight-{OLD_DATE}'
NEW_EVENT = f'moonlight-{NEW_DATE}'
DOCUMENTS = f'projects/{PROJECT}/databases/(default)/documents'
FIRESTORE = 'https://firestore.googleapis.com/v1/'
RULES = 'https://firebaserules.googleapis.com/v1/'
BASE_REVISION = 'a2afce04e3987463a50b9aa654a7746725dbbb1b'
COLLECTIONS = {'slots', 'bookings', 'bookingLookups', 'representativeLocks', 'settings', 'auditLogs'}
TIMES = {f'{hour:02}:{minute:02}' for hour in range(17, 20) for minute in range(0, 60, 15)}


class Api:
    def __init__(self):
        self.token = subprocess.check_output(
            ['gcloud', 'auth', 'print-access-token'], text=True,
        ).strip()

    def request(self, method, url, body=None, missing_ok=False):
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(url, data=data, method=method, headers={
            'Authorization': f'Bearer {self.token}',
            'Content-Type': 'application/json',
            'x-goog-user-project': PROJECT,
        })
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if missing_ok and error.code == 404:
                return None
            raise RuntimeError(f'Google API request failed: {method} HTTP {error.code}') from None

    def collection_ids(self, parent):
        result, token = [], ''
        while True:
            page = self.request('POST', FIRESTORE + parent + ':listCollectionIds', {
                'pageSize': 1000, 'pageToken': token,
            })
            result.extend(page.get('collectionIds', []))
            token = page.get('nextPageToken')
            if not token:
                return result

    def snapshot(self, event):
        parent = f'{DOCUMENTS}/events/{event}'
        root = self.request('GET', FIRESTORE + parent, missing_ok=True)
        children = self.collection_ids(parent)
        if set(children) - COLLECTIONS:
            raise RuntimeError('Unexpected event collections; review before migrating.')
        collections = {}
        for collection in children:
            documents, token = [], ''
            while True:
                query = urllib.parse.urlencode({'pageSize': 1000, 'pageToken': token})
                page = self.request('GET', FIRESTORE + parent + '/' + collection + '?' + query)
                documents.extend(page.get('documents', []))
                token = page.get('nextPageToken')
                if not token:
                    break
            collections[collection] = documents
        return {'root': root, 'collections': collections}

    def commit(self, writes):
        if len(writes) > 500:
            raise RuntimeError('Migration exceeds one atomic Firestore batch; review required.')
        return self.request('POST', FIRESTORE + DOCUMENTS + ':commit', {'writes': writes})


def value(document, field):
    return document.get('fields', {}).get(field, {}).get('stringValue')


def validate(snapshot, date):
    collections = snapshot['collections']
    slots = {doc['name'].rsplit('/', 1)[1]: doc for doc in collections.get('slots', [])}
    bookings = {doc['name'].rsplit('/', 1)[1]: doc for doc in collections.get('bookings', [])}
    lookups = {doc['name'].rsplit('/', 1)[1]: doc for doc in collections.get('bookingLookups', [])}
    locks = {doc['name'].rsplit('/', 1)[1]: doc for doc in collections.get('representativeLocks', [])}
    if len(slots) != 12 or {value(doc, 'time') for doc in slots.values()} != TIMES:
        raise RuntimeError('Expected exactly twelve event slots.')
    active = {}
    for booking_id, booking in bookings.items():
        if value(booking, 'date') != date:
            raise RuntimeError('Unexpected booking date.')
        lookup = lookups.get(value(booking, 'bookingCode'))
        if not lookup or value(lookup, 'accessKey') != booking_id:
            raise RuntimeError('Booking lookup is missing or inconsistent.')
        if value(booking, 'bookingStatus') != 'cancelled':
            slot_id = value(booking, 'slotId')
            if slot_id in active:
                raise RuntimeError('Multiple active bookings refer to one slot.')
            active[slot_id] = booking_id
            lock = locks.get(value(booking, 'phoneHash'))
            if not lock or value(lock, 'bookingId') != booking_id:
                raise RuntimeError('Representative lock is missing or inconsistent.')
    for slot_id, slot in slots.items():
        if value(slot, 'date') != date or slot_id != date + '_' + value(slot, 'time').replace(':', '-'):
            raise RuntimeError('Slot date or ID is inconsistent.')
        if value(slot, 'status') == 'reserved':
            if not value(slot, 'bookingId') or active.get(slot_id) != value(slot, 'bookingId'):
                raise RuntimeError('Reserved slot does not match an active booking.')
        elif slot_id in active:
            raise RuntimeError('An active booking points to an unreserved slot.')
    return {'bookings': len(bookings), 'active': len(active), 'slots': len(slots)}


def migrated(snapshot):
    result = copy.deepcopy(snapshot)
    documents = [result['root']] if result['root'] else []
    for collection, children in result['collections'].items():
        for document in children:
            if collection in {'bookings', 'slots'}:
                document['fields']['date'] = {'stringValue': NEW_DATE}
            if collection == 'bookings':
                slot_id = value(document, 'slotId')
                if not slot_id.startswith(OLD_DATE + '_'):
                    raise RuntimeError('Unexpected booking slot ID.')
                document['fields']['slotId'] = {'stringValue': NEW_DATE + slot_id[len(OLD_DATE):]}
            if collection == 'slots':
                document['name'] = document['name'].replace('/' + OLD_DATE + '_', '/' + NEW_DATE + '_')
            documents.append(document)
    for document in documents:
        document['name'] = document['name'].replace('/events/' + OLD_EVENT, '/events/' + NEW_EVENT, 1)
    return result


def fields_by_name(snapshot):
    documents = [snapshot['root']] if snapshot['root'] else []
    for children in snapshot['collections'].values():
        documents.extend(children)
    return {doc['name']: doc.get('fields', {}) for doc in documents}


def public_rules(revision):
    url = f'https://raw.githubusercontent.com/skyhy0228/MoonLight/{revision}/firestore.rules'
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read().decode().replace('\r\n', '\n').strip()


def backup(data):
    directory = Path.home() / '.moonlight-backups'
    directory.mkdir(mode=0o700, exist_ok=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    path = directory / f'event-date-{stamp}.json'
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as output:
        json.dump(data, output)
    print(f'Private backup saved: {path}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision', required=True, help='Reviewed Git commit containing the target rules.')
    parser.add_argument('--apply', action='store_true', help='Apply rules and atomically copy the event.')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-f0-9]{40}', args.revision):
        raise RuntimeError('Use a full reviewed Git commit SHA.')
    api = Api()
    release_url = RULES + f'projects/{PROJECT}/releases/cloud.firestore'
    release = api.request('GET', release_url)
    rule_set = api.request('GET', RULES + release['rulesetName'])
    files = rule_set['source']['files']
    if len(files) != 1:
        raise RuntimeError('Unexpected published rules layout.')
    current = files[0]['content'].replace('\r\n', '\n').strip()
    if current != public_rules(BASE_REVISION):
        raise RuntimeError('Published rules differ from the reviewed base; preserve current rules before proceeding.')
    desired = public_rules(args.revision)
    source = api.snapshot(OLD_EVENT)
    original_settings = next((doc for doc in source['collections'].get('settings', [])
                              if doc['name'].endswith('/reservation')), None)
    if not original_settings or value(original_settings, 'status') not in {'OPEN', 'CLOSED'}:
        raise RuntimeError('Reservation settings are missing or invalid.')
    target = api.snapshot(NEW_EVENT)
    if target['root'] or any(target['collections'].values()):
        raise RuntimeError('Target event already contains data; refusing to overwrite it.')
    summary = validate(source, OLD_DATE)
    validate(migrated(source), NEW_DATE)
    if len(fields_by_name(migrated(source))) > 500:
        raise RuntimeError('Migration exceeds one atomic Firestore batch; review required.')
    print('Preflight passed:', json.dumps(summary), flush=True)
    if not args.apply:
        print('Dry run only. No rules or documents were changed.', flush=True)
        return
    backup({'release': release, 'ruleset': rule_set, 'event': source})
    # Stop new submissions in the old client before withdrawing its write rules.
    api.commit([{'update': {'name': original_settings['name'], 'fields': {'status': {'stringValue': 'CLOSED'}}},
                 'updateMask': {'fieldPaths': ['status']},
                 'currentDocument': {'updateTime': original_settings['updateTime']}}])
    created_rules = api.request('POST', RULES + f'projects/{PROJECT}/rulesets', {
        'source': {'files': [{'name': files[0]['name'], 'content': desired + '\n'}]},
    })
    api.request('PATCH', release_url, {'release': {'name': release['name'], 'rulesetName': created_rules['name']}})
    print('Updated rules deployed. Waiting 70 seconds for old write rules to expire.', flush=True)
    time.sleep(70)
    # Re-read after the old event is frozen to include any in-flight cancellation.
    source = api.snapshot(OLD_EVENT)
    backup({'release': release, 'ruleset': rule_set, 'event': source,
            'originalReservationSettings': original_settings})
    summary = validate(source, OLD_DATE)
    for document in source['collections']['settings']:
        if document['name'].endswith('/reservation'):
            document['fields'] = original_settings['fields']
    target = migrated(source)
    expected = fields_by_name(target)
    writes = [{'update': {'name': name, 'fields': fields}, 'currentDocument': {'exists': False}}
              for name, fields in expected.items()]
    api.commit(writes)
    actual = api.snapshot(NEW_EVENT)
    if fields_by_name(actual) != expected:
        raise RuntimeError('Destination verification failed. Original event and private backups remain available.')
    if validate(actual, NEW_DATE) != summary:
        raise RuntimeError('Destination summary differs from the source.')
    final_release = api.request('GET', release_url)
    if final_release['rulesetName'] != created_rules['name']:
        raise RuntimeError('Published rules changed during migration; review before deploying the site.')
    print('MIGRATION VERIFIED:', json.dumps(summary), flush=True)
    print('All booking numbers and payment states preserved. Old event retained and closed.', flush=True)


if __name__ == '__main__':
    main()
