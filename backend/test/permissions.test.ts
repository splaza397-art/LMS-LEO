import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasPermission, isProgramScoped, PERMISSIONS, permissionsFor, requiresMfa, ROLES } from '../src/modules/auth/permissions';

describe('matriz RBAC', () => {
  it('solo usa roles definidos', () => {
    for (const allowed of Object.values(PERMISSIONS)) for (const role of allowed) assert.ok(ROLES.includes(role));
  });

  it('sin roles no hay permisos', () => assert.deepEqual(permissionsFor([]), []));

  it('un rol desconocido no concede permisos', () => assert.deepEqual(permissionsFor(['root']), []));

  it('aspirante no entra al campus ni a la administración', () => {
    assert.deepEqual(permissionsFor(['aspirante']), ['application:create']);
  });

  it('estudiante solo accede al campus', () => assert.deepEqual(permissionsFor(['estudiante']), ['campus:access']));

  it('soporte no accede a contenido académico', () => {
    assert.deepEqual(permissionsFor(['soporte']), ['users:read']);
  });

  it('administrador técnico no toma decisiones académicas', () => {
    for (const p of ['applications:review', 'enrolments:manage', 'programs:manage'] as const) {
      assert.equal(hasPermission(['admin_tecnico'], p), false);
    }
  });

  it('solo superadmin gestiona roles y configuración', () => {
    assert.deepEqual(PERMISSIONS['roles:manage'], ['superadmin']);
    assert.deepEqual(PERMISSIONS['config:manage'], ['superadmin']);
  });

  it('coordinador queda limitado a su programa', () => {
    assert.equal(isProgramScoped(['coordinador'], 'applications:review'), true);
    assert.equal(isProgramScoped(['coordinador'], 'reports:read'), true);
  });

  it('un rol global elimina el límite por programa', () => {
    assert.equal(isProgramScoped(['coordinador', 'admin_academico'], 'applications:review'), false);
    assert.equal(isProgramScoped(['superadmin'], 'users:read'), false);
  });

  it('un rol sin el permiso no se considera limitado', () => {
    assert.equal(isProgramScoped(['estudiante'], 'applications:review'), false);
  });

  it('exige MFA a los roles administrativos y no a los académicos operativos', () => {
    for (const role of ['superadmin', 'admin_tecnico', 'admin_academico']) assert.equal(requiresMfa([role]), true, role);
    for (const role of ['coordinador', 'profesor', 'estudiante', 'aspirante', 'soporte']) assert.equal(requiresMfa([role]), false, role);
    assert.equal(requiresMfa(['estudiante', 'superadmin']), true);
  });
});
