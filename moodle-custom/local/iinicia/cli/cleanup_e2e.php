<?php
// Elimina solo lo creado por las pruebas automaticas. Nunca ejecutar en produccion.
define('CLI_SCRIPT', true);
require(__DIR__ . '/../../../config.php');
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->dirroot . '/user/lib.php');
require_once($CFG->dirroot . '/cohort/lib.php');

\core\session\manager::set_user(get_admin());

$users = 0;
$pattern = '/^(poc|profesor|alumno|rolmoodle)\.[0-9]+@iinicia\.test$/';
foreach ($DB->get_records_select('user', "deleted = 0 AND email LIKE '%@iinicia.test'") as $user) {
    if (preg_match($pattern, $user->email)) {
        user_delete_user($user);
        $users++;
    }
}

$cohorts = 0;
foreach ($DB->get_records('cohort', ['component' => 'local_iinicia']) as $cohort) {
    if ($cohort->name === 'Generación E2E' || preg_match('/^Gen [0-9]+$/', $cohort->name)) {
        cohort_delete_cohort($cohort);
        $cohorts++;
    }
}
cli_writeln("moodle: usuarios=$users cohortes=$cohorts");
