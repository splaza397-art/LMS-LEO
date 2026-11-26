<?php
namespace local_iinicia\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;

defined('MOODLE_INTERNAL') || die();

/**
 * Fase 5: con scope=device y kcsid, cierra solo las sesiones de Moodle asociadas a esa sesión de Keycloak (más las no
 * asociadas anteriores al cierre); con scope=all (predeterminado, compatible), todas las anteriores al cierre.
 *
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
            'kcsid' => new external_value(PARAM_ALPHANUMEXT, 'Sesión de Keycloak que se cierra (alcance device)', VALUE_DEFAULT, ''),
            'scope' => new external_value(PARAM_ALPHA, 'device: solo esa sesión; all: todas las de la persona', VALUE_DEFAULT, 'all'),
        ]);
    }

    public static function execute($userid, $before = 0, $kcsid = '', $scope = 'all'): array {
        global $DB;
        $p = self::validate_parameters(self::execute_parameters(),
            ['userid' => $userid, 'before' => $before, 'kcsid' => $kcsid, 'scope' => $scope]);
        if (!in_array($p['scope'], ['device', 'all'], true) || ($p['scope'] === 'device' && $p['kcsid'] === '')) {
            throw new \invalid_parameter_exception('scope');
        }
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
        // Sesiones de Moodle asociadas por un comprobante a una sesión de Keycloak (Fase 5).
        $links = $DB->get_records_menu('local_iinicia_session_link', ['userid' => $user->id], '', 'sid, kcsid');
        if ($p['scope'] === 'all') {
            \local_iinicia\sso_ticket::revoke_before($user->id, $cutoff);
        } else {
            \local_iinicia\sso_ticket::revoke_kc_session($p['kcsid'], (int) $user->id);
        }
        // manager::login_user crea un registro de sesión nuevo al entrar (add_session), así que timecreated es la hora de entrada.
        $closed = 0;
        foreach (\core\session\manager::get_sessions_by_userid((int) $user->id) as $session) {
            $linked = $links[$session->sid] ?? null;
            if ($p['scope'] === 'all') {
                $close = (int) $session->timecreated <= $cutoff;
            } else if ($linked !== null) {
                // Asociada: solo la de esa sesión de Keycloak (no otros dispositivos ni una sesión nueva con otro sid).
                $close = $linked === $p['kcsid'];
            } else {
                // Sin asociación (entrada directa por OIDC): no se sabe de qué dispositivo es; se cierra si es anterior
                // al cierre, como antes (política segura).
                $close = (int) $session->timecreated <= $cutoff;
            }
            if ($close) {
                \core\session\manager::destroy($session->sid);
                $DB->delete_records('local_iinicia_session_link', ['sid' => $session->sid]);
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
