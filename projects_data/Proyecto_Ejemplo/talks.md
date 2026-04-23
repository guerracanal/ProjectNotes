# Charlas y Presentaciones (Talks)

Este archivo **DEBE** llamarse exactamente `talks.md` y debe ubicarse en la raíz del proyecto.

## ¿Para qué sirve?
Si este archivo existe, la aplicación habilitará automáticamente una pestaña llamada **Talks** para el proyecto. Se utiliza para listar de forma estructurada presentaciones, conferencias, webinars o charlas relacionadas con el proyecto.

## Formato de parseo
La aplicación espera un formato *muy específico* para poder extraer correctamente los metadatos y renderizarlos en un formato de "Tarjetas" (Cards) elegantes con enlaces (incluyendo enlaces personalizados como notas o repositorios).

Cada charla debe empezar con un encabezado `##` o `###`, seguido de una lista de atributos, y finalmente un resumen.

Ejemplo:

## Introducción al Proyecto
- Date: 2026-04-23
- Video: https://youtube.com/watch?v=ejemplo
- Slides: https://docs.google.com/presentation/d/ejemplo
- Notes: https://mi-enlace-a-notas.com
- CAS: https://enlace-personalizado-cas.com
- Github: https://github.com/ejemplo

Este es el texto resumen de la charla. Puedes escribir múltiples líneas y la aplicación lo mostrará en el cuerpo de la tarjeta correspondiente.
Soporta texto multilínea y formato Markdown básico.
