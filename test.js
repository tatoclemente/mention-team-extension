// @tatoclemente Este método debería usar una interface
// author: @juan fecha: nov 22, 2025

function getUserData() {
    // @maria Revisar esta lógica de validación
    // author: @tatoclemente fecha: nov 22, 2025
    return fetch('/api/user');
}

/* @carlos Optimizar esta función para mejor performance
   author: @tatoclemente fecha: nov 22, 2025 */
function processData(data) {
    return data.map(item => item.value);
}