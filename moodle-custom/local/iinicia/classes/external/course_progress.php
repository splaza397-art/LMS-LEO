<?php
namespace local_iinicia\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/enrollib.php');
require_once($CFG->libdir . '/completionlib.php');

/** Estudiantes activos de un curso con su avance. El backend decide antes quien puede consultarlo. */
class course_progress extends external_api {
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'ID de curso'),
        ]);
    }

    public static function execute($courseid): array {
        global $DB;

        $p = self::validate_parameters(self::execute_parameters(), compact('courseid'));
        $system = \context_system::instance();
        self::validate_context($system);
        require_capability('local/iinicia:syncidentity', $system);

        $course = $DB->get_record('course', ['id' => $p['courseid']], '*', MUST_EXIST);
        $context = \context_course::instance($course->id);
        $studentrole = $DB->get_field('role', 'id', ['shortname' => 'student'], MUST_EXIST);
        $users = get_role_users($studentrole, $context, false, 'u.id, u.idnumber, u.firstname, u.lastname, u.email, u.lastaccess', 'u.lastname, u.firstname');

        $students = [];
        foreach ($users as $user) {
            if (!is_enrolled($context, $user->id, '', true)) {
                continue; // Matricula suspendida o vencida.
            }
            $progress = \core_completion\progress::get_course_progress_percentage($course, $user->id);
            $lastaccess = (int) $DB->get_field('user_lastaccess', 'timeaccess', ['userid' => $user->id, 'courseid' => $course->id]);
            $students[] = [
                'id' => (int) $user->id,
                'uuid' => (string) $user->idnumber,
                'fullname' => fullname($user),
                'email' => $user->email,
                'progress' => $progress === null ? -1 : (int) round($progress),
                'lastaccess' => $lastaccess,
            ];
        }
        return ['courseid' => (int) $course->id, 'students' => $students];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'courseid' => new external_value(PARAM_INT, 'ID de curso'),
            'students' => new external_multiple_structure(new external_single_structure([
                'id' => new external_value(PARAM_INT, 'ID Moodle'),
                'uuid' => new external_value(PARAM_RAW, 'UUID IINICIA o vacio'),
                'fullname' => new external_value(PARAM_TEXT, 'Nombre'),
                'email' => new external_value(PARAM_RAW, 'Correo'),
                'progress' => new external_value(PARAM_INT, 'Porcentaje, o -1 sin seguimiento'),
                'lastaccess' => new external_value(PARAM_INT, 'Ultimo acceso al curso (Unix), o 0'),
            ])),
        ]);
    }
}
