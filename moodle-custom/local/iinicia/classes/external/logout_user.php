<?php
namespace local_iinicia\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;

defined('MOODLE_INTERNAL') || die();

/**
 * Cierra todas las sesiones de Moodle de una persona (Fase 4.10). Lo llama el backend cuando esa persona cierra
 * sesión en IINICIA, para que una pestaña, marcador o historial del navegador no siga dentro del campus.
 */
class logout_user extends external_api {
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'userid' => new external_value(PARAM_INT, 'Id de usuario Moodle'),
        ]);
    }

    public static function execute($userid): array {
        global $DB;
        $p = self::validate_parameters(self::execute_parameters(), ['userid' => $userid]);
        $context = \context_system::instance();
        self::validate_context($context);
        require_capability('local/iinicia:syncidentity', $context);

        $user = $DB->get_record('user', ['id' => $p['userid'], 'deleted' => 0], 'id, auth');
        // Solo cuentas IINICIA (OIDC): la cuenta de servicio y el administrador local no se tocan.
        if (!$user || $user->auth !== 'oauth2') {
            return ['closed' => 0];
        }
        $before = $DB->count_records('sessions', ['userid' => $user->id]);
        \core\session\manager::kill_user_sessions($user->id);
        return ['closed' => $before];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'closed' => new external_value(PARAM_INT, 'Sesiones cerradas'),
        ]);
    }
}
