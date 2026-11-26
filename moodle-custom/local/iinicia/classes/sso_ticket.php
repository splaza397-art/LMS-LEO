<?php
namespace local_iinicia;

defined('MOODLE_INTERNAL') || die();

/**
 * Comprobante de entrada al campus emitido por el backend IINICIA (versión 2, Fase 4.11).
 *
 * Formato: base64url(JSON) "." base64url(HMAC-SHA256(JSON, secreto compartido)).
 * El JSON lleva:
 * - v = 2, iss = "iinicia-backend", aud = wwwroot de este Moodle, purpose = "campus-entry";
 * - uid (usuario Moodle), uuid (UUID institucional = idnumber), sub (Keycloak = usuario vinculado OAuth2);
 * - sid (sesión de Keycloak de la que salió; solo informativo aquí, el backend la comprueba al emitir);
 * - bnd = base64url(SHA-256(valor de vinculación)): el valor vive en una cookie que este Moodle puso en el navegador
 *   que inició la entrada (paso "start" de sso.php). Sin esa cookie el comprobante no sirve: no es transferible;
 * - want (ruta local), iat y exp (60 s), jti (aleatorio, un solo uso).
 *
 * No contiene tokens ni credenciales. Un comprobante con firma válida se consume (se "quema") antes de cualquier otra
 * comprobación: si alguien prueba un enlace copiado, ese enlace deja de servir también para su dueño.
 */
class sso_ticket {
    /** Vida máxima aceptada (el backend emite comprobantes de 60 s). */
    const MAX_LIFETIME = 120;
    /** Tolerancia de reloj entre el backend y Moodle. */
    const CLOCK_SKEW = 30;
    const ISSUER = 'iinicia-backend';
    const PURPOSE = 'campus-entry';
    /** Cookie de vinculación: solo la ve sso.php, y solo en este navegador. */
    const BIND_COOKIE = 'IINICIA_SSO_BIND';
    const BIND_PATH = '/local/iinicia/';
    const BIND_LIFETIME = 300;

    /** @var \stdClass Usuario Moodle verificado. */
    public $user;
    /** @var string Ruta local de destino. */
    public $want;
    /** @var string Sesión de Keycloak (sid) de la que salió el comprobante. */
    public $sid;

    /**
     * Verifica firma, consumo único, emisor, destinatario, propósito, vigencia, destino, vinculación al navegador,
     * revocación por cierre de sesión e identidades. Lanza moodle_exception si algo falla.
     *
     * @param string $raw comprobante recibido
     * @param string $bindcookie valor de la cookie de vinculación de este navegador ('' si no tiene)
     */
    public static function verify(string $raw, string $bindcookie): self {
        global $DB, $CFG;

        $secret = (string) get_config('local_iinicia', 'ssosecret');
        if (strlen($secret) < 32) {
            throw new \moodle_exception('ssonotconfigured', 'local_iinicia');
        }
        $parts = explode('.', $raw);
        if (count($parts) !== 2 || $parts[0] === '' || $parts[1] === '') {
            throw new \moodle_exception('ssoinvalid', 'local_iinicia');
        }
        [$payload, $signature] = $parts;
        $expected = self::b64url(hash_hmac('sha256', $payload, $secret, true));
        if (!hash_equals($expected, $signature)) {
            throw new \moodle_exception('ssoinvalid', 'local_iinicia');
        }
        $data = json_decode(self::unb64url($payload));
        $strings = ['iss', 'aud', 'purpose', 'uuid', 'sub', 'sid', 'bnd', 'want', 'jti'];
        $valid = is_object($data) && ($data->v ?? null) === 2 && is_int($data->uid ?? null)
            && is_int($data->iat ?? null) && is_int($data->exp ?? null);
        foreach ($strings as $field) {
            $valid = $valid && is_string($data->$field ?? null);
        }
        if (!$valid || !preg_match('/^[A-Za-z0-9_-]{16,64}$/', $data->jti)) {
            throw new \moodle_exception('ssoinvalid', 'local_iinicia');
        }

        // Consumo único y atómico: la clave única de jti hace que, de dos canjes simultáneos, solo uno inserte. Va antes
        // de las demás comprobaciones para que un intento fallido (otro navegador, sesión cerrada) también lo consuma.
        $now = time();
        try {
            $DB->insert_record('local_iinicia_sso_ticket', (object) [
                'jti' => $data->jti, 'userid' => $data->uid, 'timecreated' => $now,
            ]);
        } catch (\dml_write_exception $e) {
            throw new \moodle_exception('ssoused', 'local_iinicia');
        }
        if (random_int(1, 50) === 1) {
            self::cleanup($now);
        }

        if ($data->iss !== self::ISSUER || $data->aud !== $CFG->wwwroot || $data->purpose !== self::PURPOSE) {
            throw new \moodle_exception('ssoinvalid', 'local_iinicia');
        }
        if ($data->exp < $now || $data->iat > $now + self::CLOCK_SKEW || $data->exp - $data->iat > self::MAX_LIFETIME) {
            throw new \moodle_exception('ssoexpired', 'local_iinicia');
        }
        // Destino: solo rutas locales de Moodle (sin esquema, sin "//" y sin barras invertidas).
        if (!preg_match('#^/(?!/)[^\\\\\s]*$#', $data->want)) {
            throw new \moodle_exception('ssoinvalid', 'local_iinicia');
        }
        // Vinculación: el navegador que canjea debe ser el que inició la entrada (tiene la cookie de este Moodle).
        if ($bindcookie === '' || !hash_equals($data->bnd, self::b64url(hash('sha256', $bindcookie, true)))) {
            throw new \moodle_exception('ssobinding', 'local_iinicia');
        }
        // Revocación: un comprobante emitido antes del último cierre de sesión de la persona ya no sirve.
        $revoked = (int) $DB->get_field('local_iinicia_revocation', 'timerevoked', ['userid' => $data->uid]);
        if ($revoked && $data->iat <= $revoked) {
            throw new \moodle_exception('ssorevoked', 'local_iinicia');
        }
        // Fase 5: cierre de un solo dispositivo. Los comprobantes de esa sesión de Keycloak ya no sirven.
        if ($DB->record_exists('local_iinicia_sid_revoked', ['kcsid' => $data->sid])) {
            throw new \moodle_exception('ssorevoked', 'local_iinicia');
        }

        // Las tres identidades deben corresponder: usuario Moodle, UUID institucional (idnumber) y sub de Keycloak.
        $user = $DB->get_record('user', [
            'id' => $data->uid, 'deleted' => 0, 'suspended' => 0, 'mnethostid' => $CFG->mnet_localhost_id,
        ]);
        $issuerid = (int) get_config('local_iinicia', 'issuerid');
        $link = $issuerid ? \auth_oauth2\linked_login::get_record(['userid' => $data->uid, 'issuerid' => $issuerid]) : false;
        if (!$user || $user->auth !== 'oauth2' || strtolower($user->idnumber) !== strtolower($data->uuid)
                || !$link || strtolower($link->get('username')) !== strtolower($data->sub)) {
            throw new \moodle_exception('ssoidentity', 'local_iinicia');
        }

        $ticket = new self();
        $ticket->user = $user;
        $ticket->want = $data->want;
        $ticket->sid = $data->sid;
        return $ticket;
    }

    /**
     * Fase 5: asocia la sesión de Moodle de este navegador con la sesión de Keycloak del comprobante, para que el cierre
     * de ese dispositivo cierre solo esta sesión (y no las de otros dispositivos ni una sesión posterior).
     */
    public static function link_session(string $moodlesid, string $kcsid, int $userid): void {
        global $DB;
        $DB->delete_records('local_iinicia_session_link', ['sid' => $moodlesid]);
        $DB->insert_record('local_iinicia_session_link', (object) [
            'sid' => $moodlesid, 'kcsid' => $kcsid, 'userid' => $userid, 'timecreated' => time(),
        ]);
    }

    /** Fase 5: los comprobantes de esta sesión de Keycloak (cerrada en un dispositivo) dejan de servir. */
    public static function revoke_kc_session(string $kcsid, int $userid): void {
        global $DB;
        if (!$DB->record_exists('local_iinicia_sid_revoked', ['kcsid' => $kcsid])) {
            try {
                $DB->insert_record('local_iinicia_sid_revoked', (object) ['kcsid' => $kcsid, 'userid' => $userid, 'timecreated' => time()]);
            } catch (\dml_write_exception $e) {
                // Otro cierre simultáneo ya la registró.
            }
        }
    }

    /** Limpieza ocasional de registros vencidos: comprobantes usados, vínculos de sesiones ya cerradas, sid revocados. */
    public static function cleanup(int $now): void {
        global $DB;
        $DB->delete_records_select('local_iinicia_sso_ticket', 'timecreated < ?', [$now - DAYSECS]);
        // Una sesión de Keycloak cerrada no vuelve: 31 días cubren la inactividad máxima de una sesión offline.
        $DB->delete_records_select('local_iinicia_sid_revoked', 'timecreated < ?', [$now - 31 * DAYSECS]);
        $DB->delete_records_select('local_iinicia_session_link',
            'timecreated < ? AND sid NOT IN (SELECT sid FROM {sessions})', [$now - HOURSECS]);
    }

    /** Registra el cierre de sesión: los comprobantes emitidos hasta $time ya no sirven. */
    public static function revoke_before(int $userid, int $time): void {
        global $DB;
        $current = $DB->get_record('local_iinicia_revocation', ['userid' => $userid]);
        if (!$current) {
            $DB->insert_record('local_iinicia_revocation', (object) ['userid' => $userid, 'timerevoked' => $time]);
        } else if ($current->timerevoked < $time) {
            $DB->set_field('local_iinicia_revocation', 'timerevoked', $time, ['id' => $current->id]);
        }
    }

    /** Valor aleatorio de vinculación, en una cookie que solo se envía a sso.php. */
    public static function new_bind_value(): string {
        $value = self::b64url(random_bytes(32));
        self::set_bind_cookie($value, time() + self::BIND_LIFETIME);
        return $value;
    }

    public static function clear_bind_cookie(): void {
        self::set_bind_cookie('', 1);
    }

    private static function set_bind_cookie(string $value, int $expires): void {
        setcookie(self::BIND_COOKIE, $value, [
            'expires' => $expires,
            'path' => self::BIND_PATH,
            'secure' => is_https(),
            'httponly' => true,
            // Lax: viaja en la navegación de primer nivel que vuelve del portal o de la app, no en peticiones de otros sitios.
            'samesite' => 'Lax',
        ]);
    }

    public static function b64url(string $bytes): string {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }

    private static function unb64url(string $text): string {
        return (string) base64_decode(strtr($text, '-_', '+/'), true);
    }
}
