var Paginator = function (fromNode, toNode) {

  var callbacks = {};
  this.addCallback = function (cbk, cbkFunc) {
    if (callbacks[cbk]) {
      callbacks[cbk].push(cbkFunc);
    } else {
      callbacks[cbk] = [cbkFunc];
    }
  };

  var emitCallback = function (cbk, arg) {
    var cbks = callbacks[cbk];

    if (!cbks) return;

    for (var i = 0, l = cbks.length; i < l; i++) {
      cbks[i](arg);
    }
  }

  // We store realHeight here so that we don't have to fetch it in a loop.
  var realHeight = document.defaultView.
                   getComputedStyle(toNode, null).
                   getPropertyValue('height').
                   replace('px', '');

  var realScrollHeight = function () {
    return toNode.scrollHeight - (toNode.offsetHeight - realHeight);
  };

  var nodeHandler = new function() {
    var running = true,
        started = false,
        currentNode = toNode,
        nodeHierarchy = [];

    // This is a helper function to facilitate properly cloning nodes. If
    // the source documents are the same, we can use cloneNode, but if
    // not we need to use importNode.
    var shallowClone = function() {

      var method;

      if (fromNode.ownerDocument === toNode.ownerDocument) {
        return function (node) {
          return node.cloneNode(false);
        }
      } else {
        var targetDocument = toNode.ownerDocument;

        return function (node) {
          return targetDocument.importNode(node, false);
        }
      }

    }();

    var reset = function () {
      toNode.innerHTML = '';
      currentNode = toNode;

      for (var i = 0, l = nodeHierarchy.length; i < l; i++) {
        childNode = shallowClone(nodeHierarchy[i]);
        currentNode.appendChild(childNode);
        currentNode = childNode;
        currentNode.appendChild(document.createTextNode(""));
      }
    };

    this.start = function () {
      // Clear target node, just in case.
      reset();
      emitCallback('start');
    }

    this.finish = function () {
      emitCallback('page', toNode.cloneNode(true));
      emitCallback('finish');
      reset();
    }

    // Handle an opening element, e.g., <div>, <a>, etc.
    this.startElement = function (element) {

      // We don't start on the first element, since the semantic here is
      // that we copy *contained* elements, not the container.
      if (!started) {
        started = true;
        return;
      }

      // First, clone the node to be copied, fill in data URI if necesssary,
      // and append it to our document.
      var newNode = shallowClone(element);

      if (newNode.nodeName === 'IMG') {
        var loaded = false;

        emitCallback('image', newNode);
      }

      currentNode.appendChild(newNode);

      // This is a total hack, for the time being. Basically, we need to
      // continue on with the parse (without moving towards a totally heavy
      // continuations based parsing model), so we have to be done the layout
      // by the time we exit here.
      if (newNode.nodeName === 'IMG') {
        if (newNode.height === 0 && newNode.width === 0) {
          newNode.height = 300;
        }
      }

      // If we've exceeded our height now, it's probably due to an image.
      // Let's try shrinking them a little. If that doesn't work, we can
      // try moving this element to the next page.
      var attempts = 0,
          imgs = toNode.getElementsByTagName('IMG'),
          l = imgs.length;
      while (l > 0 && realHeight < realScrollHeight() && attempts++ < 2) {
        for (var i = 0; i < l; i++) {
          imgs[i].height = imgs[i].height * 0.9;
        }
      }

      if (newNode.nodeName === 'IMG' && realHeight < realScrollHeight()) {
        currentNode.removeChild(newNode);

        emitCallback('page', toNode.cloneNode(true));
        reset();

        currentNode.appendChild(newNode);
      }

      // Now, make this node the currentNode so we can append stuff to it,
      // and track it in the nodeHierarchy.
      currentNode = currentNode.lastChild;
      nodeHierarchy.push(currentNode);
    }

    this.endElement = function (element) {
      currentNode = currentNode.parentNode;
      nodeHierarchy.pop();
    }

    this.textNode = function (element) {

      var textChunks = element.textContent.split(/[\r\n ]/);
      try {
        textChunks = decodeURIComponent(escape(element.textContent)).split(/[\r\n ]/);
      } catch (e) {
      }

      // Add a text node to the end of currentNode if there isn't already one there.
      if (!currentNode.lastChild || currentNode.lastChild.nodeType != 3) {
        currentNode.appendChild(currentNode.ownerDocument.createTextNode(""));
      }

      var textNode = currentNode.lastChild,
          space = '';

      var l = textChunks.length;
      while (l--) {
        // Copy this chunk into it, and see if we've overrun our bbox.
        var nextChunk = Hyphenator.hyphenate(textChunks.shift(), 'en');
//              textNode.textContent = Hyphenator.hyphenate(textNode.textContent + space + nextChunk, 'en');
        textNode.textContent = textNode.textContent + space + nextChunk;
        space = ' ';

        if (realHeight < realScrollHeight()) {
          // Okay, we've over-stepped our boundaries, pull off that last
          // text chunk and trigger the new page callback.
          textNode.textContent = textNode.textContent.substr(0, textNode.textContent.length - nextChunk.length);

          emitCallback('page', toNode.cloneNode(true));

          // Put our next chunk back in the queue to be processed, and
          // reset our destination collector to the current hierarchy.
          textChunks.unshift(nextChunk);
          l++;
          reset();

          // Now that we've reset the currentNode (which is prepped with
          // a blank text node, we need to point our text node at that.
          textNode = currentNode.lastChild;
          space = '';
        }
      }
    };
  };

  // The actual paginate function. Provided only to allow deferred starts.
  this.paginate = function () {
    new Sax.Parser(fromNode, nodeHandler).parse();
  };

};