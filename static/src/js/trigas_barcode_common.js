/** @odoo-module **/

/*
 * TRIGAS - Common Barcode Helpers
 * Este archivo contendra helpers compartidos por TRI1, TRI2, TRI3 e Interna.
 * Fase B: primeros helpers comunes migrados sin cambiar comportamiento.
 */

window.TrigasBarcodeCommon = window.TrigasBarcodeCommon || {};

window.TrigasBarcodeCommon.getLocationDisplayNameSafe = function getLocationDisplayNameSafe(location) {
    return (
        location?.display_name ||
        location?.name ||
        location?.complete_name ||
        'Ubicación'
    );
};

window.TrigasBarcodeCommon.getErrorMessageSafe = function getErrorMessageSafe(error, fallbackMessage) {
    return (
        error?.data?.message ||
        error?.data?.arguments?.[0] ||
        error?.message ||
        fallbackMessage
    );
};

window.TrigasBarcodeCommon.isInternalLocationSafe = function isInternalLocationSafe(location) {
    return !!(location && location.usage === 'internal');
};

window.TrigasBarcodeCommon.isCustomerLocationSafe = function isCustomerLocationSafe(location) {
    return !!(location && location.usage === 'customer');
};

window.TrigasBarcodeCommon.getScannedLocationSafe = function getScannedLocationSafe(barcodeData) {
    if (!barcodeData) {
        return false;
    }
    return barcodeData.destLocation || barcodeData.location || false;
};
