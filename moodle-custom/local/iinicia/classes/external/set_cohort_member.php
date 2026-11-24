<?php
namespace local_iinicia\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/cohort/lib.php');

/** La cohorte se identifica por el UUID del portal, de modo que renombrarla no crea otra. */
class set_cohort_member extends external_api {
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'idnumber' => new external_value(PARAM_ALPHANUMEXT, 'UUID de la cohorte en IINICIA'),
            'name' => new external_value(PARAM_TEXT, 'Nombre de la cohorte'),
            'userid' => new external_value(PARAM_INT, 'ID de usuario Moodle'),
            'active' => new external_value(PARAM_BOOL, 'Pertenece a la cohorte'),
        ]);
    }

    public static function execute($idnumber, $name, $userid, $active): array {
        global $DB;

        $p = self::validate_parameters(self::execute_parameters(), compact('idnumber', 'name', 'userid', 'active'));
        $system = \context_system::instance();
        self::validate_context($system);
        require_capability('local/iinicia:syncidentity', $system);
        $DB->get_record('user', ['id' => $p['userid'], 'deleted' => 0], 'id', MUST_EXIST);

        $cohort = $DB->get_record('cohort', ['idnumber' => $p['idnumber'], 'contextid' => $system->id]);
        if (!$cohort) {
            $cohort = (object) [
                'contextid' => $system->id,
                'name' => $p['name'],
                'idnumber' => $p['idnumber'],
                'description' => '',
                'descriptionformat' => FORMAT_HTML,
                'component' => 'local_iinicia',
            ];
            $cohort->id = cohort_add_cohort($cohort);
        } else if ($cohort->name !== $p['name']) {
            $cohort->name = $p['name'];
            cohort_update_cohort($cohort);
        }

        if ($p['active']) {
            cohort_add_member($cohort->id, $p['userid']);
        } else {
            cohort_remove_member($cohort->id, $p['userid']);
        }
        return ['cohortid' => (int) $cohort->id];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'cohortid' => new external_value(PARAM_INT, 'ID de la cohorte en Moodle'),
        ]);
    }
}
