<?php
namespace local_iinicia\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/enrollib.php');

/** Suspender conserva calificaciones e historial; nunca se desmatricula de forma destructiva. */
class set_enrolment extends external_api {
    private const ROLES = ['student', 'teacher', 'editingteacher'];

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'userid' => new external_value(PARAM_INT, 'ID de usuario Moodle'),
            'courseid' => new external_value(PARAM_INT, 'ID de curso'),
            'role' => new external_value(PARAM_ALPHANUMEXT, 'Rol Moodle', VALUE_DEFAULT, 'student'),
            'active' => new external_value(PARAM_BOOL, 'Matricula activa', VALUE_DEFAULT, true),
        ]);
    }

    public static function execute($userid, $courseid, $role = 'student', $active = true): array {
        global $DB;

        $p = self::validate_parameters(self::execute_parameters(), compact('userid', 'courseid', 'role', 'active'));
        $system = \context_system::instance();
        self::validate_context($system);
        require_capability('local/iinicia:syncidentity', $system);
        if (!in_array($p['role'], self::ROLES, true)) {
            throw new \invalid_parameter_exception('Rol no permitido');
        }

        $DB->get_record('user', ['id' => $p['userid'], 'deleted' => 0], 'id', MUST_EXIST);
        $course = $DB->get_record('course', ['id' => $p['courseid']], 'id', MUST_EXIST);
        $roleid = $DB->get_field('role', 'id', ['shortname' => $p['role']], MUST_EXIST);
        $plugin = enrol_get_plugin('manual');
        $instance = $DB->get_record('enrol', ['courseid' => $course->id, 'enrol' => 'manual'], '*', IGNORE_MULTIPLE);
        if (!$plugin || !$instance) {
            throw new \moodle_exception('manualenrolmissing', 'local_iinicia');
        }

        $status = $p['active'] ? ENROL_USER_ACTIVE : ENROL_USER_SUSPENDED;
        $existing = $DB->record_exists('user_enrolments', ['enrolid' => $instance->id, 'userid' => $p['userid']]);
        if ($existing) {
            $plugin->update_user_enrol($instance, $p['userid'], $status);
            $context = \context_course::instance($course->id);
            if ($p['active'] && !user_has_role_assignment($p['userid'], $roleid, $context->id)) {
                role_assign($roleid, $p['userid'], $context->id, '', 0, $instance->id);
            }
        } else if ($p['active']) {
            $plugin->enrol_user($instance, $p['userid'], $roleid, 0, 0, ENROL_USER_ACTIVE);
        }
        return ['enrolled' => $existing || $p['active'], 'active' => (bool) $p['active']];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'enrolled' => new external_value(PARAM_BOOL, 'Existe matricula'),
            'active' => new external_value(PARAM_BOOL, 'Matricula activa'),
        ]);
    }
}
