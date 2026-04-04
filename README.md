# trigas_4_conduces

Módulo personalizado para Odoo 16 orientado a gestionar el flujo operativo de **4 conduces de Trigas** para cilindros serializados, integrando lógica de inventario, ubicaciones y operación con **Barcode/PDA**.

---

## Objetivo

Este módulo automatiza y controla un flujo de trabajo de cilindros entre almacén, camión y cliente, utilizando cuatro conduces relacionados entre sí desde una orden de venta.

El enfoque principal es asegurar trazabilidad por serial, control de ubicaciones y ejecución operativa mediante escaneo.

---

## Versión objetivo

- **Odoo 16**
- Compatible con entornos que utilicen **Inventario**, **Ventas** y **Barcode**

---

## Dependencias funcionales

Este módulo requiere que estén disponibles e instalados los módulos base necesarios de Odoo para su operación, especialmente los relacionados con:

- Ventas
- Inventario
- Barcode

Las dependencias técnicas exactas deben validarse en el archivo `__manifest__.py`.

---

## Nombre técnico del módulo

```python
trigas_4_conduces
