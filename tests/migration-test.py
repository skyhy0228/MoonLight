"""Offline checks for preservation and integrity of the event date migration."""

import copy
from pathlib import Path
import runpy
import unittest

migration = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'scripts' / 'migrateEventDate.py'))
OLD_DATE = migration['OLD_DATE']
NEW_DATE = migration['NEW_DATE']
PREFIX = migration['DOCUMENTS'] + '/events/' + migration['OLD_EVENT']


def document(collection, identifier, **fields):
    return {'name': f'{PREFIX}/{collection}/{identifier}',
            'fields': {key: {'stringValue': value} for key, value in fields.items()}}


def fixture():
    slots = [document('slots', OLD_DATE + '_' + time.replace(':', '-'),
                      date=OLD_DATE, time=time, status='available')
             for time in sorted(migration['TIMES'])]
    slots[0]['fields'].update({'status': {'stringValue': 'reserved'},
                              'bookingId': {'stringValue': 'stable-access-key'}})
    booking = document('bookings', 'stable-access-key', bookingCode='MOON-1028-ABCDE',
                       date=OLD_DATE, time='17:00', slotId=OLD_DATE + '_17-00',
                       bookingStatus='confirmed', paymentStatus='confirmed', phoneHash='stable-phone-hash')
    booking['fields']['teamSize'] = {'integerValue': '4'}
    booking['fields']['createdAt'] = {'timestampValue': '2026-10-27T00:00:00Z'}
    return {'root': {'name': PREFIX, 'fields': {'name': {'stringValue': 'MoonLight'}}},
            'collections': {
                'slots': slots,
                'bookings': [booking],
                'bookingLookups': [document('bookingLookups', 'MOON-1028-ABCDE', accessKey='stable-access-key')],
                'representativeLocks': [document('representativeLocks', 'stable-phone-hash', bookingId='stable-access-key')],
                'settings': [document('settings', 'reservation', status='CLOSED')],
                'auditLogs': [document('auditLogs', 'history', action='payment_confirmed', date=OLD_DATE)],
            }}


class MigrationTests(unittest.TestCase):
    def test_preserves_booking_identity_payment_and_original_snapshot(self):
        source = fixture()
        original = copy.deepcopy(source)
        target = migration['migrated'](source)
        before = source['collections']['bookings'][0]['fields']
        after = target['collections']['bookings'][0]['fields']
        for field in before.keys() - {'date', 'slotId'}:
            self.assertEqual(before[field], after[field])
        self.assertEqual(after['date'], {'stringValue': NEW_DATE})
        self.assertEqual(after['slotId'], {'stringValue': NEW_DATE + '_17-00'})
        self.assertEqual(source, original)
        self.assertEqual(migration['validate'](source, OLD_DATE), migration['validate'](target, NEW_DATE))

    def test_preserves_closed_status_and_historical_audit_fields(self):
        source = fixture()
        target = migration['migrated'](source)
        for collection in ('settings', 'auditLogs', 'bookingLookups', 'representativeLocks'):
            self.assertEqual(source['collections'][collection][0]['fields'],
                             target['collections'][collection][0]['fields'])
        for name in migration['fields_by_name'](target):
            self.assertIn('/events/' + migration['NEW_EVENT'], name)

    def test_rejects_a_reserved_slot_with_no_booking(self):
        source = fixture()
        source['collections']['slots'][1]['fields']['status'] = {'stringValue': 'reserved'}
        with self.assertRaises(RuntimeError):
            migration['validate'](source, OLD_DATE)

    def test_rejects_missing_lookup_or_representative_lock(self):
        for collection in ('bookingLookups', 'representativeLocks'):
            source = fixture()
            source['collections'][collection] = []
            with self.assertRaises(RuntimeError):
                migration['validate'](source, OLD_DATE)


if __name__ == '__main__':
    unittest.main()
