<?php
namespace local_iinicia\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;

defined('MOODLE_INTERNAL') || die();

class list_courses extends external_api {
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([]);
    }

    public static function execute(): array {
        global $DB;

        $system = \context_system::instance();
        self::validate_context($system);
        require_capability('local/iinicia:syncidentity', $system);
        $courses = $DB->get_records_select('course', 'id <> :site', ['site' => SITEID], 'fullname', 'id, fullname, shortname, visible');
        return ['courses' => array_values(array_map(fn($c) => [
            'id' => (int) $c->id,
            'fullname' => format_string($c->fullname),
            'shortname' => format_string($c->shortname),
            'visible' => (bool) $c->visible,
        ], $courses))];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'courses' => new external_multiple_structure(new external_single_structure([
                'id' => new external_value(PARAM_INT, 'ID'),
                'fullname' => new external_value(PARAM_TEXT, 'Nombre'),
                'shortname' => new external_value(PARAM_TEXT, 'Nombre corto'),
                'visible' => new external_value(PARAM_BOOL, 'Visible'),
            ])),
        ]);
    }
}
