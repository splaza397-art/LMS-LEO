<?php
namespace local_iinicia\external;

use auth_oauth2\api as oauth_api;
use auth_oauth2\linked_login;
use core\oauth2\issuer;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/user/lib.php');

/**
 * Alta idempotente: el UUID IINICIA (idnumber) es la clave estable; el correo solo vincula
 * cuentas previas que aun no pertenecen a ninguna identidad.
 */
class upsert_user extends external_api {
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'uuid' => new external_value(PARAM_ALPHANUMEXT, 'UUID interno IINICIA'),
            'oidcsub' => new external_value(PARAM_ALPHANUMEXT, 'Identificador sub de OIDC'),
            'email' => new external_value(PARAM_EMAIL, 'Correo validado'),
            'firstname' => new external_value(PARAM_NOTAGS, 'Nombre'),
            'lastname' => new external_value(PARAM_NOTAGS, 'Apellidos'),
            'suspended' => new external_value(PARAM_BOOL, 'Cuenta suspendida', VALUE_DEFAULT, false),
        ]);
    }

    public static function execute($uuid, $oidcsub, $email, $firstname, $lastname, $suspended = false): array {
        global $CFG, $DB;

        $p = self::validate_parameters(self::execute_parameters(), compact(
            'uuid', 'oidcsub', 'email', 'firstname', 'lastname', 'suspended'
        ));
        $context = \context_system::instance();
        self::validate_context($context);
        require_capability('local/iinicia:syncidentity', $context);

        $issuerid = (int) get_config('local_iinicia', 'issuerid');
        if (!$issuerid) {
            throw new \moodle_exception('issuernotconfigured', 'local_iinicia');
        }
        $issuer = new issuer($issuerid);
        $uuid = strtolower($p['uuid']);
        $sub = strtolower($p['oidcsub']);
        $email = strtolower($p['email']);

        // Dos sincronizaciones simultaneas de la misma persona se ejecutan en serie: la segunda encuentra
        // la cuenta que creo la primera en lugar de intentar crearla otra vez.
        [$user, $created] = \local_iinicia\lock::run('user_' . $uuid, function () use ($DB, $CFG, $p, $uuid, $sub, $email, $issuer) {
            $tx = $DB->start_delegated_transaction();
            try {
                $where = ['idnumber' => $uuid, 'deleted' => 0, 'mnethostid' => $CFG->mnet_localhost_id];
                $user = $DB->get_record('user', $where);
                if (!$user) {
                    $link = oauth_api::match_username_to_user($sub, $issuer);
                    if ($link) {
                        $user = $DB->get_record('user', ['id' => $link->get('userid'), 'deleted' => 0]);
                    }
                }
                if (!$user) {
                    $user = $DB->get_record_select(
                        'user',
                        'LOWER(email) = :email AND deleted = 0 AND mnethostid = :host',
                        ['email' => $email, 'host' => $CFG->mnet_localhost_id],
                        '*',
                        IGNORE_MULTIPLE
                    ) ?: null;
                }
                if ($user && $user->idnumber !== '' && $user->idnumber !== $uuid) {
                    throw new \moodle_exception('identityconflict', 'local_iinicia');
                }

                $created = false;
                if (!$user) {
                    $new = (object) [
                        'auth' => 'oauth2',
                        'confirmed' => 1,
                        'mnethostid' => $CFG->mnet_localhost_id,
                        'username' => 'iin_' . str_replace('-', '', $uuid),
                        'password' => AUTH_PASSWORD_NOT_CACHED,
                        'idnumber' => $uuid,
                        'email' => $email,
                        'firstname' => $p['firstname'],
                        'lastname' => $p['lastname'],
                        'suspended' => (int) $p['suspended'],
                        'lang' => 'es',
                    ];
                    $id = user_create_user($new, false, false);
                    $user = $DB->get_record('user', ['id' => $id], '*', MUST_EXIST);
                    $created = true;
                } else {
                    $changes = ['id' => $user->id];
                    $desired = [
                        'idnumber' => $uuid,
                        'email' => $email,
                        'firstname' => $p['firstname'],
                        'lastname' => $p['lastname'],
                        'suspended' => (int) $p['suspended'],
                    ];
                    foreach ($desired as $field => $value) {
                        if ((string) $user->$field !== (string) $value) {
                            $changes[$field] = $value;
                        }
                    }
                    if (count($changes) > 1) {
                        user_update_user((object) $changes, false, false);
                    }
                }

                $existing = oauth_api::match_username_to_user($sub, $issuer);
                if ($existing && (int) $existing->get('userid') !== (int) $user->id) {
                    $existing->set('userid', $user->id);
                    $existing->update();
                } else if ($existing && $existing->get('confirmtoken') !== '') {
                    $existing->set('confirmtoken', '');
                    $existing->update();
                } else if (!$existing) {
                    $record = (object) [
                        'issuerid' => $issuer->get('id'),
                        'username' => $sub,
                        'userid' => $user->id,
                        'email' => $email,
                        'confirmtoken' => '',
                        'confirmtokenexpires' => 0,
                    ];
                    (new linked_login(0, $record))->create();
                }
                $tx->allow_commit();
                return [$user, $created];
            } catch (\Throwable $e) {
                $tx->rollback($e);
            }
        });

        if ($p['suspended']) {
            \core\session\manager::destroy_user_sessions($user->id);
        }
        return ['moodleuserid' => (int) $user->id, 'created' => $created];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'moodleuserid' => new external_value(PARAM_INT, 'ID de usuario Moodle'),
            'created' => new external_value(PARAM_BOOL, 'Indica si la cuenta se creo en esta llamada'),
        ]);
    }
}
