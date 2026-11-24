<?php
namespace local_iinicia\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;

defined('MOODLE_INTERNAL') || die();

/** Solo administra asignaciones propias (component local_iinicia); nunca toca las hechas a mano en Moodle. */
class set_system_role extends external_api {
    private const ROLES = ['manager'];

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'userid' => new external_value(PARAM_INT, 'ID de usuario Moodle'),
            'role' => new external_value(PARAM_ALPHANUMEXT, 'Rol Moodle'),
            'active' => new external_value(PARAM_BOOL, 'Rol activo'),
        ]);
    }

    public static function execute($userid, $role, $active): array {
        global $DB;

        $p = self::validate_parameters(self::execute_parameters(), compact('userid', 'role', 'active'));
        $system = \context_system::instance();
        self::validate_context($system);
        require_capability('local/iinicia:syncidentity', $system);
        if (!in_array($p['role'], self::ROLES, true)) {
            throw new \invalid_parameter_exception('Rol no permitido');
        }
        $DB->get_record('user', ['id' => $p['userid'], 'deleted' => 0], 'id', MUST_EXIST);
        $roleid = $DB->get_field('role', 'id', ['shortname' => $p['role']], MUST_EXIST);
        if ($p['active']) {
            role_assign($roleid, $p['userid'], $system->id, 'local_iinicia');
        } else {
            role_unassign($roleid, $p['userid'], $system->id, 'local_iinicia');
        }
        return ['active' => (bool) $p['active']];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'active' => new external_value(PARAM_BOOL, 'Rol activo'),
        ]);
    }
}
