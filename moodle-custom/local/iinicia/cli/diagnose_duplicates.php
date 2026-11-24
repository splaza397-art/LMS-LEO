<?php
// Diagnostico de solo lectura: duplicados que pudo dejar el defecto I1 (sincronizaciones simultaneas).
// No borra ni combina nada. Uso: php public/local/iinicia/cli/diagnose_duplicates.php
define('CLI_SCRIPT', true);
require(__DIR__ . '/../../../config.php');
require_once($CFG->libdir . '/clilib.php');

$problems = 0;

$cohorts = $DB->get_records_sql(
    "SELECT idnumber, COUNT(*) AS total FROM {cohort} WHERE idnumber <> '' GROUP BY idnumber HAVING COUNT(*) > 1"
);
foreach ($cohorts as $row) {
    $problems++;
    cli_writeln("COHORTE duplicada idnumber={$row->idnumber} ({$row->total} copias):");
    foreach ($DB->get_records('cohort', ['idnumber' => $row->idnumber], 'id ASC') as $c) {
        $members = $DB->count_records('cohort_members', ['cohortid' => $c->id]);
        cli_writeln("  id={$c->id} nombre=\"{$c->name}\" miembros={$members} creada=" . userdate($c->timecreated, '%Y-%m-%d %H:%M'));
    }
}

$users = $DB->get_records_sql(
    "SELECT idnumber, COUNT(*) AS total FROM {user} WHERE deleted = 0 AND idnumber <> '' GROUP BY idnumber HAVING COUNT(*) > 1"
);
foreach ($users as $row) {
    $problems++;
    cli_writeln("USUARIO duplicado idnumber={$row->idnumber} ({$row->total} cuentas)");
}

$links = $DB->get_records_sql(
    "SELECT userid, COUNT(*) AS total FROM {auth_oauth2_linked_login} GROUP BY userid HAVING COUNT(*) > 1"
);
foreach ($links as $row) {
    $problems++;
    cli_writeln("VINCULO OIDC multiple para userid={$row->userid} ({$row->total} vinculos)");
}

$enrols = $DB->get_records_sql(
    "SELECT courseid, COUNT(*) AS total FROM {enrol} WHERE enrol = 'manual' GROUP BY courseid HAVING COUNT(*) > 1"
);
foreach ($enrols as $row) {
    $problems++;
    cli_writeln("CURSO con varias instancias manuales courseid={$row->courseid} ({$row->total})");
}

cli_writeln($problems ? "Se encontraron {$problems} problemas. No se modifico nada." : 'Sin duplicados.');
exit($problems ? 1 : 0);
