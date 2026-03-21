function getVariable(el, propertyName) {
    return String(getComputedStyle(el).getPropertyValue('--' + propertyName)).trim();
};

function processTheElements() {
    var thes = document.querySelectorAll('.the');
    for (var i = 0; i < thes.length; i++) {
        var v = getVariable(thes[i], thes[i].getAttribute('display-var'));
        if (thes[i].textContent != v) {
            thes[i].textContent = v;
        }
    }
}


function _vertical(el, tb) {
    var doc, docEl, rect, win;

    // return zero for disconnected and hidden elements
    if ( !el.getClientRects().length ) {
        return 0;
    }

    rect = el.getBoundingClientRect();

    doc = el.ownerDocument;
    docEl = doc.documentElement;
    win = doc.defaultView;

    return rect[tb] + win.pageYOffset - docEl.clientTop;
}


function offsetTop(el) {
    return _vertical(el, "top");
}

function offsetBottom(el) {
    return _vertical(el, "bottom");
}

function offsetBaseline(el) {
    var mpbaseline = el.querySelector('.mpbaseline');
    return offsetBottom(mpbaseline);
}

function heightAboveBaseline(el) {
    var baseline = offsetBaseline(el);
    var top = offsetTop(el);
    return baseline - top;
}


function positionMarginpars() {
    var mpars = document.querySelectorAll('.marginpar > div');
    var prevBottom = 0;

    mpars.forEach(function(mpar) {
        var mpref = document.querySelector('.body #marginref-' + mpar.id);

        var baselineref = offsetBottom(mpref);
        var heightAB = heightAboveBaseline(mpar);
        var height = mpar.offsetHeight;

        var top = Math.round((baselineref - heightAB - prevBottom) * 10) / 10;

        if (mpar.style.marginTop != Math.max(0, top) + "px") {
            mpar.style.marginTop = Math.max(0, top) + "px";
        }

        // if margintop would have been negative, the element is now further down
        prevBottom = baselineref - heightAB + height - Math.min(0, top);
    });
}



// throttled resize handler
var optimizedResize = (function() {
    var callbacks = [],
        running = false;

    function resize() {
        if (!running) {
            running = true;

            if (window.requestAnimationFrame) {
                window.requestAnimationFrame(runCallbacks);
            } else {
                setTimeout(runCallbacks, 66);
            }
        }
    }

    function runCallbacks() {
        callbacks.forEach(function(callback) { callback(); });
        running = false;
    }

    function addCallback(callback) {
        if (callback) {
            callbacks.push(callback);
        }
    }

    return {
        add: function(callback) {
            if (!callbacks.length) {
                window.addEventListener('resize', resize);
            }
            addCallback(callback);
        }
    }
}());


// setup event listeners

function completed() {
    document.removeEventListener("DOMContentLoaded", completed);
	window.removeEventListener("load", positionMarginpars);

    var observer = new MutationObserver(function() {
        processTheElements();
        positionMarginpars();
    });

    observer.observe(document, { attributes: true, childList: true, characterData: true, subtree: true });

    optimizedResize.add(positionMarginpars);

    processTheElements();
    positionMarginpars();
}

document.addEventListener("DOMContentLoaded", completed);
window.addEventListener("load", completed);
