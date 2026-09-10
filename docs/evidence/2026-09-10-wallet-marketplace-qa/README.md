# QA local de wallets y venta · 10 septiembre 2026

Capturas de navegador aislado, datos sintéticos y proveedor que rechaza todas las firmas. No prueban una compra o venta real.

- [Menú a 320 px](account-menu-mobile.png): UKI agrupado, créditos y colección; BSC/TRON separados.
- [Selector a 320×568](wallet-selector-mobile.png): una opción por wallet y cuerpo desplazable sin desbordamiento.
- [Venta a 390×844](sale-modal-mobile.png): abre desde la tarjeta; acepta `12,5`; muestra comisión y aprobación/publicación separadas. También contrastado a 1280 px.

Producto final `7fd47d3`: lint, typecheck, 261 suites/2.127 tests y build de 92 páginas PASS. Las capturas del modal corresponden a `a869d42`; el único cambio posterior abre el selector EVM sin proveedores instalados y cuenta con su regresión.

Verificación BSC de solo lectura a las 17:00:12 UTC: anuncio `103000000002940` activo, ownerOf en escrow y precio coincidente. `eth_call buyToken` con balance simulado devuelve `0x`; sin balance en la cuenta QA devuelve OutOfFunds. Esto no acredita el saldo del usuario ni una firma real. En TRON se cubren selección del proveedor firmante, conservación del txid, consulta tras timeout y ausencia de segundo envío; compra firmada pendiente.
