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

/** La visibilidad se calcula para el usuario consultado, no para la cuenta de servicio. */
class student_overview extends external_api {
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'userid' => new external_value(PARAM_INT, 'ID de usuario Moodle'),
        ]);
    }

    public static function execute($userid): array {
        global $CFG, $DB;

        $p = self::validate_parameters(self::execute_parameters(), compact('userid'));
        $system = \context_system::instance();
        self::validate_context($system);
        require_capability('local/iinicia:syncidentity', $system);
        $DB->get_record('user', ['id' => $p['userid'], 'deleted' => 0], 'id', MUST_EXIST);

        $result = [];
        foreach (enrol_get_users_courses($p['userid'], true, '*') as $course) {
            $modinfo = get_fast_modinfo($course, $p['userid']);
            $completion = new \completion_info($course);
            $sections = [];
            foreach ($modinfo->get_section_info_all() as $section) {
                if (!$section->uservisible) {
                    continue;
                }
                $activities = [];
                foreach ($modinfo->sections[$section->section] ?? [] as $cmid) {
                    $cm = $modinfo->cms[$cmid];
                    if (!$cm->uservisible || $cm->deletioninprogress || !$cm->has_view()) {
                        continue;
                    }
                    $custom = $cm->customdata;
                    $due = 0;
                    if (is_array($custom)) {
                        $due = (int) ($custom['duedate'] ?? $custom['timeclose'] ?? 0);
                    }
                    $done = false;
                    if ($completion->is_enabled($cm) != COMPLETION_TRACKING_NONE) {
                        $state = $completion->get_data($cm, false, $p['userid'])->completionstate;
                        $done = in_array((int) $state, [COMPLETION_COMPLETE, COMPLETION_COMPLETE_PASS], true);
                    }
                    $activities[] = [
                        'cmid' => (int) $cm->id,
                        'name' => $cm->get_formatted_name(),
                        'modname' => $cm->modname,
                        'url' => $cm->url ? $cm->url->out(false) : '',
                        'duedate' => $due,
                        'completed' => $done,
                    ];
                }
                if ($activities) {
                    $sections[] = [
                        'id' => (int) $section->id,
                        'name' => get_section_name($course, $section),
                        'activities' => $activities,
                    ];
                }
            }
            $progress = \core_completion\progress::get_course_progress_percentage($course, $p['userid']);
            $result[] = [
                'id' => (int) $course->id,
                'fullname' => format_string($course->fullname),
                'shortname' => format_string($course->shortname),
                'summary' => trim(html_to_text($course->summary ?? '', 0, false)),
                'progress' => $progress === null ? -1 : (int) round($progress),
                'url' => $CFG->wwwroot . '/course/view.php?id=' . $course->id,
                'sections' => $sections,
            ];
        }
        return ['courses' => $result];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'courses' => new external_multiple_structure(new external_single_structure([
                'id' => new external_value(PARAM_INT, 'ID'),
                'fullname' => new external_value(PARAM_TEXT, 'Nombre'),
                'shortname' => new external_value(PARAM_TEXT, 'Nombre corto'),
                'summary' => new external_value(PARAM_RAW, 'Resumen en texto'),
                'progress' => new external_value(PARAM_INT, 'Porcentaje, o -1 sin seguimiento'),
                'url' => new external_value(PARAM_URL, 'URL'),
                'sections' => new external_multiple_structure(new external_single_structure([
                    'id' => new external_value(PARAM_INT, 'ID'),
                    'name' => new external_value(PARAM_TEXT, 'Nombre'),
                    'activities' => new external_multiple_structure(new external_single_structure([
                        'cmid' => new external_value(PARAM_INT, 'ID del modulo'),
                        'name' => new external_value(PARAM_TEXT, 'Nombre'),
                        'modname' => new external_value(PARAM_ALPHANUMEXT, 'Tipo'),
                        'url' => new external_value(PARAM_RAW, 'URL'),
                        'duedate' => new external_value(PARAM_INT, 'Fecha limite Unix, o 0'),
                        'completed' => new external_value(PARAM_BOOL, 'Completada'),
                    ])),
                ])),
            ])),
        ]);
    }
}
