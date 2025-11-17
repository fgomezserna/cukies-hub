/*
 * Name          : joy.js
 * @author       : Roberto D'Amico (Bobboteck)
 * Last modified : 09.06.2020
 * Revision      : 1.1.6
 *
 * Modification History:
 * Date         Version     Modified By     Description
 * 2021-12-21   2.0.0       Roberto D'Amico New version of the project that integrates the callback functions, while 
 *                                          maintaining compatibility with previous versions. Fixed Issue #27 too, 
 *                                          thanks to @artisticfox8 for the suggestion.
 * 2020-06-09   1.1.6       Roberto D'Amico Fixed Issue #10 and #11
 * 2020-04-20   1.1.5       Roberto D'Amico Correct: Two sticks in a row, thanks to @liamw9534 for the suggestion
 * 2020-04-03               Roberto D'Amico Correct: InternalRadius when change the size of canvas, thanks to 
 *                                          @vanslipon for the suggestion
 * 2020-01-07   1.1.4       Roberto D'Amico Close #6 by implementing a new parameter to set the functionality of 
 *                                          auto-return to 0 position
 * 2019-11-18   1.1.3       Roberto D'Amico Close #5 correct indication of East direction
 * 2019-11-12   1.1.2       Roberto D'Amico Removed Fix #4 incorrectly introduced and restored operation with touch 
 *                                          devices
 * 2019-11-12   1.1.1       Roberto D'Amico Fixed Issue #4 - Now JoyStick work in any position in the page, not only 
 *                                          at 0,0
 * 
 * The MIT License (MIT)
 *
 *  This file is part of the JoyStick Project (https://github.com/bobboteck/JoyStick).
 *	Copyright (c) 2015 Roberto D'Amico (Bobboteck).
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

let StickStatus =
{
    xPosition: 0,
    yPosition: 0,
    x: 0,
    y: 0,
    cardinalDirection: "C"
};

/**
 * @desc Principal object that draw a joystick, you only need to initialize the object and suggest the HTML container
 * @costructor
 * @param container {String} - HTML object that contains the Joystick
 * @param parameters (optional) - object with following keys:
 *  title {String} (optional) - The ID of canvas (Default value is 'joystick')
 *  width {Int} (optional) - The width of canvas, if not specified is setted at width of container object (Default value is the width of container object)
 *  height {Int} (optional) - The height of canvas, if not specified is setted at height of container object (Default value is the height of container object)
 *  internalFillColor {String} (optional) - Internal color of Stick (Default value is '#00AA00')
 *  internalLineWidth {Int} (optional) - Border width of Stick (Default value is 2)
 *  internalStrokeColor {String}(optional) - Border color of Stick (Default value is '#003300')
 *  externalLineWidth {Int} (optional) - External reference circonference width (Default value is 2)
 *  externalStrokeColor {String} (optional) - External reference circonference color (Default value is '#008000')
 *  autoReturnToCenter {Bool} (optional) - Sets the behavior of the stick, whether or not, it should return to zero position when released (Default value is True and return to zero)
 * @param callback {StickStatus} - 
 */
var JoyStick = (function(container, parameters, callback)
{
    parameters = parameters || {};
    var title = (typeof parameters.title === "undefined" ? "joystick" : parameters.title),
        width = (typeof parameters.width === "undefined" ? 0 : parameters.width),
        height = (typeof parameters.height === "undefined" ? 0 : parameters.height),
        internalFillColor = (typeof parameters.internalFillColor === "undefined" ? "#00AA00" : parameters.internalFillColor),
        internalLineWidth = (typeof parameters.internalLineWidth === "undefined" ? 2 : parameters.internalLineWidth),
        internalStrokeColor = (typeof parameters.internalStrokeColor === "undefined" ? "#003300" : parameters.internalStrokeColor),
        externalLineWidth = (typeof parameters.externalLineWidth === "undefined" ? 2 : parameters.externalLineWidth),
        externalStrokeColor = (typeof parameters.externalStrokeColor ===  "undefined" ? "#008000" : parameters.externalStrokeColor),
        autoReturnToCenter = (typeof parameters.autoReturnToCenter === "undefined" ? true : parameters.autoReturnToCenter);

    callback = callback || function(StickStatus) {};

    // Create Canvas element and add it in the Container object
    var objContainer = document.getElementById(container);
    
    // Fixing Unable to preventDefault inside passive event listener due to target being treated as passive in Chrome [Thanks to https://github.com/artisticfox8 for this suggestion]
    objContainer.style.touchAction = "none";

    var canvas = document.createElement("canvas");
    canvas.id = title;
    if(width === 0) { width = objContainer.clientWidth; }
    if(height === 0) { height = objContainer.clientHeight; }
    canvas.width = width;
    canvas.height = height;
    objContainer.appendChild(canvas);
    var context=canvas.getContext("2d");

    var pressed = 0; // Bool - 1=Yes - 0=No
    var circumference = 2 * Math.PI;
    // Calcular radio interno asegurando que sea siempre positivo y tenga un mínimo
    var calculatedInternalRadius = (canvas.width-((canvas.width/2)+10))/2;
    var internalRadius = Math.max(10, calculatedInternalRadius); // Mínimo de 10px para evitar radios negativos
    var maxMoveStick = internalRadius + 5;
    var externalRadius = internalRadius + 30;
    var centerX = canvas.width / 2;
    var centerY = canvas.height / 2;
    var directionHorizontalLimitPos = canvas.width / 10;
    var directionHorizontalLimitNeg = directionHorizontalLimitPos * -1;
    var directionVerticalLimitPos = canvas.height / 10;
    var directionVerticalLimitNeg = directionVerticalLimitPos * -1;
    // Used to save current position of stick
    var movedX=centerX;
    var movedY=centerY;
    
    // Variable para rastrear el touch activo
    var touchId = null;
    var touch = null;
    var touchIndex = -1;

    // Check if the device support the touch or not
    if("ontouchstart" in document.documentElement)
    {
        // Escuchar touchstart tanto en el canvas como en el contenedor
        canvas.addEventListener("touchstart", onTouchStart, false);
        objContainer.addEventListener("touchstart", onTouchStart, false);
        document.addEventListener("touchmove", onTouchMove, false);
        document.addEventListener("touchend", onTouchEnd, false);
    }
    else
    {
        canvas.addEventListener("mousedown", onMouseDown, false);
        document.addEventListener("mousemove", onMouseMove, false);
        document.addEventListener("mouseup", onMouseUp, false);
    }
    // Draw the object
    drawExternal();
    drawInternal();
    
    // Función para buscar y capturar cualquier touch activo después de la inicialización
    function checkForActiveTouch() {
        // Solo buscar si no hay un touch activo ya
        if(pressed === 0 && touchId === null) {
            // Buscar cualquier touch activo en el documento
            // Nota: No podemos acceder directamente a los touches activos,
            // pero podemos usar un pequeño truco: esperar al próximo touchmove
            // y capturarlo inmediatamente
            var checkTimeout = setTimeout(function() {
                // Si después de un breve delay no hay touch activo, cancelar
                if(pressed === 0) {
                    // No hay touch activo, está bien
                }
            }, 100);
        }
    }
    
    // Intentar capturar cualquier touch activo después de un breve delay
    // Esto ayuda cuando el joystick se inicializa después de que el touch comenzó
    setTimeout(function() {
        checkForActiveTouch();
    }, 10);

    /******************************************************
     * Private methods
     *****************************************************/

    /**
     * @desc Draw the external circle used as reference position
     */
    function drawExternal()
    {
        context.beginPath();
        context.arc(centerX, centerY, externalRadius, 0, circumference, false);
        context.lineWidth = externalLineWidth;
        context.strokeStyle = externalStrokeColor;
        context.stroke();
    }

    /**
     * @desc Draw the internal stick in the current position the user have moved it
     */
    function drawInternal()
    {
        context.beginPath();
        if(movedX<internalRadius) { movedX=maxMoveStick; }
        if((movedX+internalRadius) > canvas.width) { movedX = canvas.width-(maxMoveStick); }
        if(movedY<internalRadius) { movedY=maxMoveStick; }
        if((movedY+internalRadius) > canvas.height) { movedY = canvas.height-(maxMoveStick); }
        context.arc(movedX, movedY, internalRadius, 0, circumference, false);
        // create radial gradient
        var grd = context.createRadialGradient(centerX, centerY, 5, centerX, centerY, 200);
        // Light color
        grd.addColorStop(0, internalFillColor);
        // Dark color
        grd.addColorStop(1, internalStrokeColor);
        context.fillStyle = grd;
        context.fill();
        context.lineWidth = internalLineWidth;
        context.strokeStyle = internalStrokeColor;
        context.stroke();
    }

    /**
     * @desc Events for manage touch
     */
    function onTouchStart(event)
    {
        var firstTouch = event.targetTouches[0];
        pressed = 1;
        touchId = firstTouch.identifier;
        touch = firstTouch;
        touchIndex = 0;
        
        // Procesar inmediatamente la posición inicial del touch
        // Usar getBoundingClientRect con clientX/clientY (más preciso, no afectado por scroll)
        var rect = canvas.getBoundingClientRect();
        var touchX = firstTouch.clientX - rect.left;
        var touchY = firstTouch.clientY - rect.top;
        
        // Verificar si el touch está dentro del área del joystick
        var distanceFromCenter = Math.sqrt(
            Math.pow(touchX - centerX, 2) + 
            Math.pow(touchY - centerY, 2)
        );
        
        if(distanceFromCenter <= externalRadius + 20) {
            // El touch está dentro del área, calcular la posición relativa al centro
            // Limitar el movimiento al círculo externo si es necesario
            var distance = Math.sqrt(Math.pow(touchX - centerX, 2) + Math.pow(touchY - centerY, 2));
            if(distance > maxMoveStick) {
                var angle = Math.atan2(touchY - centerY, touchX - centerX);
                movedX = centerX + Math.cos(angle) * maxMoveStick;
                movedY = centerY + Math.sin(angle) * maxMoveStick;
            } else {
                // El touch está dentro del área válida, usar su posición directamente
                movedX = touchX;
                movedY = touchY;
            }
            
            // Delete canvas
            context.clearRect(0, 0, canvas.width, canvas.height);
            // Redraw object
            drawExternal();
            drawInternal();

            // Set attribute of callback
            StickStatus.xPosition = movedX;
            StickStatus.yPosition = movedY;
            StickStatus.x = (100*((movedX - centerX)/maxMoveStick)).toFixed();
            StickStatus.y = ((100*((movedY - centerY)/maxMoveStick))*-1).toFixed();
            StickStatus.cardinalDirection = getCardinalDirection();
            callback(StickStatus);
        } else {
            // El touch está fuera del área, resetear
            pressed = 0;
            touchId = null;
            touch = null;
        }
    }

    function onTouchMove(event)
    {
        // Verificar si el touch está relacionado con este joystick usando touchId
        // También aceptar si el target es el canvas o está dentro del contenedor
        // Resetear touch y touchIndex para buscar el touch correcto
        touch = null;
        touchIndex = -1;
        
        // Si ya tenemos un touchId, buscar ese touch específico
        if(touchId !== null) {
            for(var i = 0; i < event.targetTouches.length; i++) {
                if(event.targetTouches[i].identifier === touchId) {
                    touch = event.targetTouches[i];
                    touchIndex = i;
                    break;
                }
            }
        }
        
        // Si no encontramos el touch por ID, intentar capturar cualquier touch dentro del área
        // Esto permite capturar touches que comenzaron antes de que el joystick se inicializara
        // Intentar capturar cualquier touch activo que no esté siendo rastreado
        // También intentar si pressed es 1 pero touch es null (caso donde se activó pero no se capturó)
        // IMPORTANTE: También buscar si touchId es null (joystick recién inicializado)
        if(touch === null && event.targetTouches.length > 0 && (touchId === null || pressed === 0)) {
            // Buscar el touch que está dentro del área del joystick
            for(var i = 0; i < event.targetTouches.length; i++) {
                var currentTouch = event.targetTouches[i];
                
                // Calcular posición relativa al canvas usando getBoundingClientRect con clientX/clientY
                var rect = canvas.getBoundingClientRect();
                var relativeX = currentTouch.clientX - rect.left;
                var relativeY = currentTouch.clientY - rect.top;
                
                // Verificar si el touch está dentro del área del joystick (círculo externo)
                // Usar un área más grande para capturar mejor los touches que comenzaron antes
                var distanceFromCenter = Math.sqrt(
                    Math.pow(relativeX - centerX, 2) + 
                    Math.pow(relativeY - centerY, 2)
                );
                
                // Aumentar el área de captura para asegurar que capturemos el touch
                var captureRadius = externalRadius + 50; // Área más grande para captura inicial
                
                if(distanceFromCenter <= captureRadius) {
                    // El touch está dentro del área del joystick, activarlo inmediatamente
                    pressed = 1;
                    touchId = currentTouch.identifier;
                    touch = currentTouch;
                    touchIndex = i;
                    console.log('[JoyStick] Captured touch that started before joystick initialization, touchId:', touchId);
                    
                    // Procesar el movimiento inmediatamente con la posición actual del touch
                    // Usar getBoundingClientRect con clientX/clientY (más preciso, no afectado por scroll)
                    var rect = canvas.getBoundingClientRect();
                    var touchX = touch.clientX - rect.left;
                    var touchY = touch.clientY - rect.top;
                    
                    console.log('[JoyStick] Touch position relative to canvas:', {
                        touchClientX: touch.clientX,
                        touchClientY: touch.clientY,
                        rectLeft: rect.left,
                        rectTop: rect.top,
                        touchX: touchX,
                        touchY: touchY,
                        centerX: centerX,
                        centerY: centerY,
                        canvasWidth: canvas.width,
                        canvasHeight: canvas.height
                    });
                    
                    // Calcular la posición relativa al centro del joystick
                    // Limitar el movimiento al círculo externo
                    var distance = Math.sqrt(Math.pow(touchX - centerX, 2) + Math.pow(touchY - centerY, 2));
                    if(distance > maxMoveStick) {
                        var angle = Math.atan2(touchY - centerY, touchX - centerX);
                        movedX = centerX + Math.cos(angle) * maxMoveStick;
                        movedY = centerY + Math.sin(angle) * maxMoveStick;
                    } else {
                        // El touch está dentro del área válida, usar su posición directamente
                        movedX = touchX;
                        movedY = touchY;
                    }
                    
                    // Delete canvas
                    context.clearRect(0, 0, canvas.width, canvas.height);
                    // Redraw object
                    drawExternal();
                    drawInternal();

                    // Set attribute of callback
                    StickStatus.xPosition = movedX;
                    StickStatus.yPosition = movedY;
                    StickStatus.x = (100*((movedX - centerX)/maxMoveStick)).toFixed();
                    StickStatus.y = ((100*((movedY - centerY)/maxMoveStick))*-1).toFixed();
                    StickStatus.cardinalDirection = getCardinalDirection();
                    callback(StickStatus);
                    
                    // Salir del loop una vez que encontramos y capturamos el touch
                    break;
                }
            }
        }
        
        if(pressed === 1 && touch !== null)
        {
            // Usar getBoundingClientRect con clientX/clientY (más preciso, no afectado por scroll)
            var rect = canvas.getBoundingClientRect();
            var touchX = touch.clientX - rect.left;
            var touchY = touch.clientY - rect.top;
            
            // Calcular la posición relativa al centro del joystick
            // Limitar el movimiento al círculo externo
            var distance = Math.sqrt(Math.pow(touchX - centerX, 2) + Math.pow(touchY - centerY, 2));
            if(distance > maxMoveStick) {
                var angle = Math.atan2(touchY - centerY, touchX - centerX);
                movedX = centerX + Math.cos(angle) * maxMoveStick;
                movedY = centerY + Math.sin(angle) * maxMoveStick;
            } else {
                // El touch está dentro del área válida, usar su posición directamente
                movedX = touchX;
                movedY = touchY;
            }
            // Delete canvas
            context.clearRect(0, 0, canvas.width, canvas.height);
            // Redraw object
            drawExternal();
            drawInternal();

            // Set attribute of callback
            StickStatus.xPosition = movedX;
            StickStatus.yPosition = movedY;
            StickStatus.x = (100*((movedX - centerX)/maxMoveStick)).toFixed();
            StickStatus.y = ((100*((movedY - centerY)/maxMoveStick))*-1).toFixed();
            StickStatus.cardinalDirection = getCardinalDirection();
            callback(StickStatus);
        }
    }

    function onTouchEnd(event)
    {
        if (event.changedTouches[0].identifier !== touchId) return;

        pressed = 0;
        // If required reset position store variable
        if(autoReturnToCenter)
        {
            movedX = centerX;
            movedY = centerY;
        }
        // Delete canvas
        context.clearRect(0, 0, canvas.width, canvas.height);
        // Redraw object
        drawExternal();
        drawInternal();

        // Set attribute of callback
        StickStatus.xPosition = movedX;
        StickStatus.yPosition = movedY;
        StickStatus.x = (100*((movedX - centerX)/maxMoveStick)).toFixed();
        StickStatus.y = ((100*((movedY - centerY)/maxMoveStick))*-1).toFixed();
        StickStatus.cardinalDirection = getCardinalDirection();
        callback(StickStatus);
    }

    /**
     * @desc Events for manage mouse
     */
    function onMouseDown(event) 
    {
        pressed = 1;
    }

    /* To simplify this code there was a new experimental feature here: https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/offsetX , but it present only in Mouse case not metod presents in Touch case :-( */
    function onMouseMove(event)
    {
        if(pressed === 1)
        {
            // Usar getBoundingClientRect con clientX/clientY (más preciso, no afectado por scroll)
            var rect = canvas.getBoundingClientRect();
            movedX = event.clientX - rect.left;
            movedY = event.clientY - rect.top;
            // Delete canvas
            context.clearRect(0, 0, canvas.width, canvas.height);
            // Redraw object
            drawExternal();
            drawInternal();

            // Set attribute of callback
            StickStatus.xPosition = movedX;
            StickStatus.yPosition = movedY;
            StickStatus.x = (100*((movedX - centerX)/maxMoveStick)).toFixed();
            StickStatus.y = ((100*((movedY - centerY)/maxMoveStick))*-1).toFixed();
            StickStatus.cardinalDirection = getCardinalDirection();
            callback(StickStatus);
        }
    }

    function onMouseUp(event) 
    {
        pressed = 0;
        // If required reset position store variable
        if(autoReturnToCenter)
        {
            movedX = centerX;
            movedY = centerY;
        }
        // Delete canvas
        context.clearRect(0, 0, canvas.width, canvas.height);
        // Redraw object
        drawExternal();
        drawInternal();

        // Set attribute of callback
        StickStatus.xPosition = movedX;
        StickStatus.yPosition = movedY;
        StickStatus.x = (100*((movedX - centerX)/maxMoveStick)).toFixed();
        StickStatus.y = ((100*((movedY - centerY)/maxMoveStick))*-1).toFixed();
        StickStatus.cardinalDirection = getCardinalDirection();
        callback(StickStatus);
    }

    function getCardinalDirection()
    {
        let result = "";
        let orizontal = movedX - centerX;
        let vertical = movedY - centerY;
        
        if(vertical >= directionVerticalLimitNeg && vertical <= directionVerticalLimitPos)
        {
            result = "C";
        }
        if(vertical < directionVerticalLimitNeg)
        {
            result = "N";
        }
        if(vertical > directionVerticalLimitPos)
        {
            result = "S";
        }
        
        if(orizontal < directionHorizontalLimitNeg)
        {
            if(result === "C")
            { 
                result = "W";
            }
            else
            {
                result += "W";
            }
        }
        if(orizontal > directionHorizontalLimitPos)
        {
            if(result === "C")
            { 
                result = "E";
            }
            else
            {
                result += "E";
            }
        }
        
        return result;
    }

    /******************************************************
     * Public methods
     *****************************************************/

    /**
     * @desc The width of canvas
     * @return Number of pixel width 
     */
    this.GetWidth = function () 
    {
        return canvas.width;
    };

    /**
     * @desc The height of canvas
     * @return Number of pixel height
     */
    this.GetHeight = function () 
    {
        return canvas.height;
    };

    /**
     * @desc The X position of the cursor relative to the canvas that contains it and to its dimensions
     * @return Number that indicate relative position
     */
    this.GetPosX = function ()
    {
        return movedX;
    };

    /**
     * @desc The Y position of the cursor relative to the canvas that contains it and to its dimensions
     * @return Number that indicate relative position
     */
    this.GetPosY = function ()
    {
        return movedY;
    };

    /**
     * @desc Normalizzed value of X move of stick
     * @return Integer from -100 to +100
     */
    this.GetX = function ()
    {
        return (100*((movedX - centerX)/maxMoveStick)).toFixed();
    };

    /**
     * @desc Normalizzed value of Y move of stick
     * @return Integer from -100 to +100
     */
    this.GetY = function ()
    {
        return ((100*((movedY - centerY)/maxMoveStick))*-1).toFixed();
    };

    /**
     * @desc Get the direction of the cursor as a string that indicates the cardinal points where this is oriented
     * @return String of cardinal point N, NE, E, SE, S, SW, W, NW and C when it is placed in the center
     */
    this.GetDir = function()
    {
        return getCardinalDirection();
    };
});

// Asegurar que JoyStick esté disponible en window para compatibilidad con módulos ES6
if (typeof window !== 'undefined') {
    window.JoyStick = JoyStick;
}
