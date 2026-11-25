<?php
namespace local_iinicia;

defined('MOODLE_INTERNAL') || die();

/**
 * Comprobante de entrada al campus emitido por el backend IINICIA (Fase 4.10).
 *
 * Formato: base64url(JSON) "." base64url(HMAC-SHA256(JSON, secreto compartido)).
 * El JSON lleva: v (versión), uid (id de usuario Moodle), uuid (UUID institucional), sub (identificador OIDC de
 * Keycloak), want (ruta local de destino), iat y exp (segundos Unix) y jti (identificador aleatorio de un solo uso).
 *
 * El navegador solo transporta el comprobante: no puede cambiar el usuario ni el destino sin invalidar la firma, y
 * un comprobante solo sirve una vez y durante poco tiempo. No contiene tokens ni credenciales.
 */
class sso_ticket {
    /** Vida máxima aceptada (el backend emite comprobantes de 60 s). */
    const MAX_LIFETIME = 120;
    /** Tolerancia de reloj entre el backend y Moodle. */
    const CLOCK_SKEW = 30;

    /** @var \stdClass Usuario Moodle verificado. */
    public $user;
    /** @var string Ruta local de destino. */
    public $want;

    /**
     * Verifica firma, vigencia, correspondencia de identidades y uso único. Lanza moodle_exception si algo falla.
     */
    public static function verify(string $raw): self {
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
        if (!is_object($data) || ($data->v ?? null) !== 1 || !is_int($data->uid ?? null) || !is_int($data->iat ?? null)
                || !is_int($data->exp ?? null) || !is_string($data->jti ?? null) || !is_string($data->uuid ?? null)
                || !is_string($data->sub ?? null) || !is_string($data->want ?? null)) {
            throw new \moodle_exception('ssoinvalid', 'local_iinicia');
        }
        $now = time();
        if ($data->exp < $now || $data->iat > $now + self::CLOCK_SKEW || $data->exp - $data->iat > self::MAX_LIFETIME
                || !preg_match('/^[A-Za-z0-9_-]{16,64}$/', $data->jti)) {
            throw new \moodle_exception('ssoexpired', 'local_iinicia');
        }
        // Destino: solo rutas locales de Moodle (sin esquema, sin "//" y sin barras invertidas).
        if (!preg_match('#^/(?!/)[^\\\\\s]*$#', $data->want)) {
            throw new \moodle_exception('ssoinvalid', 'local_iinicia');
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

        // Uso único: la clave única de jti hace que el segundo intento falle aunque llegue al mismo tiempo.
        try {
            $DB->insert_record('local_iinicia_sso_ticket', (object) [
                'jti' => $data->jti, 'userid' => $data->uid, 'timecreated' => $now,
            ]);
        } catch (\dml_write_exception $e) {
            throw new \moodle_exception('ssoused', 'local_iinicia');
        }
        if (random_int(1, 50) === 1) {
            $DB->delete_records_select('local_iinicia_sso_ticket', 'timecreated < ?', [$now - DAYSECS]);
        }

        $ticket = new self();
        $ticket->user = $user;
        $ticket->want = $data->want;
        return $ticket;
    }

    private static function b64url(string $bytes): string {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }

    private static function unb64url(string $text): string {
        return (string) base64_decode(strtr($text, '-_', '+/'), true);
    }
}
