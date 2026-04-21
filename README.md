# trigas_4_conduces

Módulo personalizado para **Odoo 16** orientado a gestionar el flujo operativo de conduces de Trigas para cilindros serializados, integrando lógica de inventario, ubicaciones, impresión de documentos y operación con **Barcode / PDA**.

---

## Objetivo

Este módulo automatiza y controla el flujo de entrega de cilindros serializados desde una orden de venta, asegurando:

- trazabilidad por serial
- control de ubicaciones
- validación operativa mediante escaneo
- firma digital en entrega al cliente
- histórico de firmas
- generación de documentos PDF relacionados al proceso

---

## Alcance actual

La versión actual del módulo trabaja principalmente con el flujo operativo de:

1. **Conduce 1**: Almacén → Camión  
2. **Conduce 2**: Camión → Cliente  

Además, incluye soporte para:

- impresión de **Conduce Cliente**
- barcode de ubicación del cliente
- firma digital en el **Conduce 2**
- histórico centralizado de firmas de entrega
- generación y descarga de PDF desde el registro de firma
- validaciones en Barcode / PDA para seriales y ubicaciones

---

## Funcionalidades principales

### 1. Generación automática de conduces
Al confirmar una orden de venta con productos marcados como cilindros Trigas, el módulo genera automáticamente los conduces operativos relacionados al flujo.

### 2. Control por serial
Los cilindros se controlan por número de serie, asegurando que los seriales entregados correspondan al flujo generado desde la orden.

### 3. Ubicaciones Trigas por cliente
Cada cliente puede tener asociada una ubicación interna específica de Trigas, con su propio barcode para ser utilizada en el proceso de entrega.

### 4. Integración con Barcode / PDA
El módulo extiende la lógica del módulo de código de barras para permitir:

- escaneo de ubicación de camión
- escaneo de ubicación del cliente
- validación de seriales permitidos
- firma digital directamente desde PDA en el **Conduce 2**

### 5. Conduce Cliente en PDF
Se incluye un reporte imprimible tipo **Conduce Cliente**, mostrando información de la orden y el barcode de ubicación del cliente.

### 6. Firma digital de entrega
En el flujo **Camión → Cliente (Conduce 2)** se puede capturar firma digital, guardar el nombre de quien recibe y registrar la fecha y hora de firma.

### 7. Histórico de firmas
Cada firma registrada en el Conduce 2 puede almacenarse en un histórico centralizado, permitiendo:

- consulta posterior
- generación de PDF
- descarga del documento firmado
- trazabilidad de evidencia de entrega

---

## Versión objetivo

- **Odoo 16**
- Compatible con entornos que utilicen:
  - **Ventas**
  - **Inventario**
  - **Barcode**
  - **Mail**

---

## Dependencias técnicas

Las dependencias del módulo están definidas en el archivo `__manifest__.py`.

Actualmente depende de:

- `sale_management`
- `stock`
- `stock_barcode`
- `mail`

---

## Nombre técnico del módulo

```python
trigas_4_conduces
