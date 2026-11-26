<?php
defined('MOODLE_INTERNAL') || die();

$string['pluginname'] = 'IINICIA integration';
$string['iinicia:syncidentity'] = 'Synchronise IINICIA identities and enrolments';
$string['identityconflict'] = 'The email already belongs to a different IINICIA identity.';
$string['issuernotconfigured'] = 'The IINICIA identity provider is not configured.';
$string['manualenrolmissing'] = 'The course has no manual enrolment instance.';
$string['locktimeout'] = 'Another synchronisation of the same resource is still running ({$a}). It will be retried.';
$string['ssoinvalid'] = 'The campus link is not valid. Please sign in again from IINICIA.';
$string['ssoexpired'] = 'The campus link has expired. Please sign in again from IINICIA.';
$string['ssoused'] = 'This campus link has already been used. Please sign in again from IINICIA.';
$string['ssoidentity'] = 'Your identity could not be verified on the campus. Please sign in again from IINICIA.';
$string['ssonotconfigured'] = 'Campus sign-in from IINICIA is not configured.';
$string['privacy:metadata:ssoticket'] = 'Campus sign-in tickets already used, kept to prevent reuse. Deleted after 24 hours.';
$string['privacy:metadata:ssoticket:userid'] = 'User who used the ticket.';
$string['privacy:metadata:ssoticket:timecreated'] = 'Time of use.';
$string['ssobinding'] = 'This campus link was opened in a different browser from the one that requested it. Please sign in again from IINICIA on this device.';
$string['ssorevoked'] = 'This campus link is no longer valid because the session was closed. Please sign in again from IINICIA.';
$string['privacy:metadata:revocation'] = 'Time of the last IINICIA sign-out, so campus links issued earlier no longer work.';
$string['privacy:metadata:revocation:userid'] = 'User who signed out.';
$string['privacy:metadata:revocation:timerevoked'] = 'Time of sign-out.';
$string['privacy:metadata:sessionlink'] = 'Link between a campus session and the IINICIA session that opened it, to close only that device.';
$string['privacy:metadata:sessionlink:userid'] = 'User of the session.';
$string['privacy:metadata:sessionlink:timecreated'] = 'Time of campus entry.';
$string['privacy:metadata:sidrevoked'] = 'IINICIA sessions closed on one device, so their campus links no longer work. Deleted after 31 days.';
$string['privacy:metadata:sidrevoked:userid'] = 'User who signed out.';
$string['privacy:metadata:sidrevoked:timecreated'] = 'Time of sign-out.';
