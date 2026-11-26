<?php
namespace local_iinicia\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;

defined('MOODLE_INTERNAL') || die();

/**
 * Cierra las sesiones de Moodle de una persona (Fase 4.10). Lo llama el backend cuando esa persona cierra sesión en
 * IINICIA, para que una pestaña, marcador o historial del navegador no siga dentro del campus.
 *
 * Fase 4.11: con "before" (hora del cierre en IINICIA) solo se cierran las sesiones abiertas hasta ese momento. Así,
 * el reintento tardío de un cierre antiguo (Moodle estaba caído) no cierra la sesión nueva que la persona abrió
 * después con credenciales. También revoca los comprobantes de entrada emitidos hasta esa hora.
 */
class logout_user extends external_api {
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'userid' => new external_value(PARAM_INT, 'Id de usuario Moodle'),
            'before' => new external_value(PARAM_INT, 'Hora Unix del cierre en IINICIA (0 = ahora)', VALUE_DEFAULT, 0),
        ]);
    }

    public static function execute($userid, $before = 0): array {
        global $DB;
        $p = self::validate_parameters(self::execute_parameters(), ['userid' => $userid, 'before' => $before]);
        $context = \context_system::instance();
        self::validate_context($context);
        require_capability('local/iinicia:syncidentity', $context);

        $user = $DB->get_record('user', ['id' => $p['userid'], 'deleted' => 0], 'id, auth');
        // Solo cuentas IINICIA (OIDC): la cuenta de servicio y el administrador local no se tocan.
        if (!$user || $user->auth !== 'oauth2') {
            return ['closed' => 0];
        }
        $now = time();
        $cutoff = ($p['before'] > 0 && $p['before'] <= $now) ? $p['before'] : $now;
        \local_iinicia\sso_ticket::revoke_before($user->id, $cutoff);
        // manager::login_user crea un registro de sesión nuevo al entrar (add_session), así que timecreated es la hora de entrada.
        $closed = 0;
        foreach (\core\session\manager::get_sessions_by_userid((int) $user->id) as $session) {
            if ((int) $session->timecreated <= $cutoff) {
                \core\session\manager::destroy($session->sid);
                $closed++;
            }
        }
        return ['closed' => $closed];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'closed' => new external_value(PARAM_INT, 'Sesiones cerradas'),
        ]);
    }
}
