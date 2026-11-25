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
