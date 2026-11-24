/** Mensajes de estado compartidos: cargando y "no disponible". Se anuncian a lectores de pantalla. */
export const Loading = ({ label = "Cargando..." }: { label?: string }) => <p role="status" className="muted">{label}</p>;
export const Unavailable = () => <p role="alert" className="text-amber-700">Esta información no está disponible por el momento.</p>;
