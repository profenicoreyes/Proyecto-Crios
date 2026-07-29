# CRIOS A2-005 - Implementacion de persistencia de publicaciones

## 1. Propósito

Persistir publicaciones, records, referencias activas e historial de activacion para que Studio pueda recuperarlos despues de una recarga.

## 2. Alcance

A2-005 cubre persistencia local y su integracion con Studio. Runtime no consulta publicaciones persistidas ni referencias activas en este sprint.

## 3. Decisión de almacenamiento

La implementacion utiliza `window.localStorage`, una sola clave (`crios.publication.persistence.v1`) y un unico documento JSON. No hay servidor, nube, autenticacion ni sincronizacion entre dispositivos.

## 4. Arquitectura

Una API raiz congelada crea adapters inyectables. Un coordinador comparte exactamente un adapter entre el store de publicaciones y el store de activacion. Studio crea un coordinador privado durante su inicializacion.

## 5. Documento persistido

El esquema 1 contiene exactamente `schemaVersion`, `stateRevision`, `updatedAt`, `publications`, `publicationRecords`, `activeReferences` y `activationRecords`. Se validan formas, unicidad, relaciones, campañas, versiones, hashes, fechas e historial ordenado.

## 6. API de persistencia

`CRIOS_PUBLICATION_PERSISTENCE` 1.0.0 expone exactamente `version`, `constants`, `createStorageAdapter`, `createPersistentPublicationStore`, `createPersistentActivationStore`, `createPersistenceCoordinator`, `isPersistenceDocument` y `calculateSerializedSize`. La API y sus constantes estan profundamente congeladas.

## 7. Storage adapter

El adapter recibe storage, clave, version de esquema, limite y reloj. Lee sin escribir cuando la clave no existe, rechaza corrupcion o esquemas desconocidos sin borrarlos, exporta copias y elimina solo su clave configurada.

## 8. Store de publicaciones

Implementa la interfaz exacta observada: commit atomico de publicacion y record, lecturas individuales, listas por campaña, version siguiente derivada y snapshot defensivo con `versionsByCampaign`. Una operacion fallida no consume version.

## 9. Store de activación

Implementa commit de referencia final e historial en una transaccion, lectura activa, historial y snapshot. Valida estado anterior, estado esperado, publicaciones resolubles y transiciones coherentes. Studio adapta privadamente colisiones del contador protegido al recargar, sin cambiar el core.

## 10. Coordinador

El coordinador congelado expone ambos stores, estado, exportacion y limpieza. Reporta revision, fecha, bytes y conteos a partir del documento compartido.

## 11. Integración con Studio

Los controladores existentes aceptan stores opcionales y conservan el comportamiento en memoria cuando no se inyectan. Studio recupera la campaña activa o la ultima campaña publicada antes de construir los controladores y agrega `CRIOS_STUDIO.persistence` en su unico freeze final.

## 12. Interfaz

El panel muestra estado, ultima actualizacion, tamaño y conteos. Los avisos distinguen persistencia local de nube y modo degradado. El borrado exige una casilla explicita y el boton permanece deshabilitado hasta aceptarla.

## 13. Atomicidad

Cada transaccion valida una copia completa, confirma la revision observada, incrementa `stateRevision` una vez, calcula tamaño, ejecuta un solo `setItem`, relee y verifica contenido y revision. La atomicidad se limita a una escritura sincrona de una clave local.

## 14. Recuperación y errores

JSON corrupto y esquema desconocido se conservan sin migracion ni reemplazo. Studio sigue operativo con stores en memoria, muestra el error y permite limpieza explicita. Se distinguen lectura, escritura, cuota, tamaño, conflicto, verificacion y limpieza.

## 15. Compatibilidad

Las APIs exactas de Publicacion, Activacion y sus superficies anidadas en Studio permanecen sin cambios. Las suites anteriores pasan sin modificaciones: 50/50, 44/44 y 63/63.

## 16. No interferencia con Runtime

Runtime no abre la clave, no crea coordinadores y no resuelve publicaciones activas. La aplicacion principal carga la API raiz sin leer ni escribir almacenamiento.

## 17. Pruebas

La suite de persistencia pasa 89/89. Las cuatro suites pasan 246/246. La validacion sintactica por HTTP y `new Function` pasa 12/12; Node no esta disponible. El smoke aislado demostro publicacion v1, activacion, recarga, v2 consecutiva, activacion v2, rollback, desactivacion, exportacion, borrado y estado vacio.

## 18. Limitaciones

Los datos pertenecen al navegador y origen actuales. No hay sincronizacion entre pestañas, bloqueo distribuido, servidor, nube ni coordinacion multiusuario. El alcance soportado es una pestaña de Studio por perfil y origen.

## 19. Integridad

Los cambios se limitan a los diez archivos nuevos y siete archivos autorizados. Los nucleos protegidos, suites anteriores, documentos anteriores, Runtime, release, publish, share, campañas, misiones y `.git` permanecen fuera del alcance de escritura.

## 20. Veredicto

PUBLICATION_PERSISTENCE_READY_FOR_RUNTIME_INTEGRATION
