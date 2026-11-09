# Créditos de imágenes

El usuario autorizó imágenes generadas con aspecto profesional si no se encontraban
fotos reales presentables y uniformes. Las fotos reales exploradas se descartaron;
no se incluyen en el proyecto ni se reutilizaron como referencia de generación.
Las seis imágenes finales se generaron para esta entrega, sin marcas, con fondo
blanco y una misma iluminación y gama azul/naranja. Son representaciones de ejemplo,
no fotografías de unidades reales ni pruebas de certificación o compatibilidad.

| Archivo en frontend/public/productos/ | Autor / creación | Fuente | Licencia / procedencia |
| --- | --- | --- | --- |
| balon-5kg.png | Generada con OpenAI para Gas al Paso | Herramienta de generación de imágenes de este proyecto | Imagen generada; no corresponde licencia de fotografía de terceros |
| balon-11kg.png | Generada con OpenAI para Gas al Paso | Herramienta de generación de imágenes de este proyecto | Imagen generada; no corresponde licencia de fotografía de terceros |
| balon-15kg.png | Generada con OpenAI para Gas al Paso | Herramienta de generación de imágenes de este proyecto | Imagen generada; no corresponde licencia de fotografía de terceros |
| balon-45kg.png | Generada con OpenAI para Gas al Paso | Herramienta de generación de imágenes de este proyecto | Imagen generada; no corresponde licencia de fotografía de terceros |
| regulador.png | Generada con OpenAI para Gas al Paso | Herramienta de generación de imágenes de este proyecto | Imagen generada; no corresponde licencia de fotografía de terceros |
| manguera.png | Generada con OpenAI para Gas al Paso | Herramienta de generación de imágenes de este proyecto | Imagen generada; no corresponde licencia de fotografía de terceros |

No se asigna una licencia Creative Commons ni se inventan autores de fotografías.
La utilización de contenido generado se rige por las condiciones aplicables del
servicio de OpenAI: https://openai.com/policies/terms-of-use/.
Los campos de autor, fuente y licencia de fotografías de terceros pueden completarse
si más adelante se reemplazan estas referencias por fotos reales del negocio.

Los PNG originales se copiaron y renombraron sin editar, recortar ni comprimir.
La vista 4:3 usa object-fit: cover. Las rutas de los seis JPG de la primera entrega
se normalizan a estos PNG para que los pedidos anteriores sigan mostrando su imagen.
El SVG de reemplazo reutiliza Balon de frontend/src/components/Ilustraciones.jsx.

Los tamaños, dimensiones y hashes de los archivos entregados están registrados en
imagenes-productos.json. La página /creditos-imagenes.html, enlazada desde el pie
del sitio, indica públicamente que son imágenes generadas y referenciales.

## Archivos mayores de 200 KB

- balon-5kg.png: 1234.4 KB (1,234,437 bytes).
- balon-11kg.png: 1204.8 KB (1,204,768 bytes).
- balon-15kg.png: 1206.5 KB (1,206,470 bytes).
- balon-45kg.png: 1160.1 KB (1,160,058 bytes).
- regulador.png: 1501.2 KB (1,501,171 bytes).
- manguera.png: 1365.5 KB (1,365,502 bytes).

Los seis superan 200 KB (200.000 bytes). Se conservan los originales para que el
usuario los optimice como pidió. Comprobar otra vez con
`node scripts/revisar-imagenes.mjs`. Al reemplazar un archivo por otro formato,
actualizar también la ruta imagen; conservar extensión real y procedencia correcta.
