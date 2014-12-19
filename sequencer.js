;(function() {

	// Returns the function it is passed with the array of arguments already applied
	var partial = function(argArray, fn) {
		return function() {
			var args = Array.prototype.slice.call(arguments)
			fn.apply(null, argArray.concat(args))
		};
	};
	
	var Sequencer = function(canvasId, formId, tempoId) {
		var canvas = document.getElementById(canvasId);
		var screen = canvas.getContext("2d");
		var audioCtx = new AudioContext();
		var waveTypes = ['noise', 'triangle', 'sawtooth', 'sine', 'square'];
		// red, orange, yellow, green, blue: normal, light
		var colorPalettes = [{active : ["#DF151A", "#DF151A"], light : ["#A020F0", "#BF5FFF"], neutral : ["#424242", "#575757", "#000000"]},
							 {active : ["#FD8603", "#FD8603"], light : ["#A020F0", "#BF5FFF"], neutral : ["#424242", "#575757", "#000000"]},
							 {active : ["#F4F328", "#F4F328"], light : ["#A020F0", "#BF5FFF"], neutral : ["#424242", "#575757", "#000000"]},
							 {active : ["#00DA3C", "#00DA3C"], light : ["#A020F0", "#BF5FFF"], neutral : ["#424242", "#575757", "#000000"]},
							 {active : ["#24C0EB", "#5CCEEE"], light : ["#A020F0", "#BF5FFF"], neutral : ["#424242", "#575757", "#000000"]}]

		//--------------------- properties
		this.channels = {};
		this.players = {};
		for (var i = 0; i < waveTypes.length; i++) {
			this.channels[waveTypes[i]] = new Grid(waveTypes[i], 
				 								   canvas.width, canvas.height, 
				 								   Math.floor(canvas.width / 16), 
				 								   colorPalettes[i]);
			this.players[waveTypes[i]] = new Player(261.626, 16, waveTypes[i], audioCtx); // C4 to Eb5
		}
		this.currentGrid = this.channels[waveTypes[0]];
		this.mouseInput = new SequencerMouseInput(canvas, this);
		this.currentBeat = 15;	// the beat increments right away, so start one before 0
		this.ticker = new Ticker();

		//--------------------- timing and main functions
		// step once on the beat
		var self = this;
		var runSequencer = function() {
			self.step();
		};

		// draw 60fps
		this.runUpdate = function() {
			self.draw(screen);
		}
		this.ticker.every(17, this.runUpdate);

		// set tempo
		var lastId;
		this.setTempo = function(tempo) {
			// adjust tempo to be in range (including 0 for pause/stop purposes)
			tempo = (tempo < 0) ? 0 : ((tempo > 300) ? 300 : tempo);
			this.ticker.delete(lastId);
			lastId = this.ticker.every(this.tempoToTimestep(tempo), runSequencer);
		} 

		//--------------------- UI
		this.setupUI(formId);
		this.displayView = "all";

		//--------------------- event listeners for changing tabs
		this.tempoSelect = document.getElementById(tempoId);
		this.setupEventHandlers();
	};

	Sequencer.prototype = {
		setState : function(state) {
			if (state === "play") {
				this.play();
			} else if (state === "pause") {
				this.pause();
			} else if (state === "stop") {
				this.stop();
			}
		},

		play : function() {
			this.setTempo(this.tempoSelect.value);
			this.currentState = "play";
		},

		pause : function() {
			this.stopPlayingSound();
			this.setTempo(0);
			this.currentState = "pause";
		},

		stop : function() {
			this.pause();
			this.currentBeat = 15;
			this.currentState = "stop";
		},

		stopPlayingSound : function() {
			// for each channel
			for (var waveType in this.players) {
				var player = this.players[waveType];
				var grid = this.channels[waveType];

				// +1 since current beat starts on beat -1
				var prevCol = grid.array[this.currentBeat];

				for (var i = 0; i < 16; i++) {
					// stop playing the previous column
					if (player.oscillators[i] != null) {
						player.stop(i);
					}
				}
			}
		},

		setupEventHandlers : function() {
			this.currentState = "play";
			var self = this;
			var _fn;
			
			window.addEventListener("blur", function() {
				var lastState = self.currentState;
				self.pause();

				// remove last event listener added from previous blur call
				window.removeEventListener("focus", _fn);

				_fn = function() {
					self[lastState]();
				};
				window.addEventListener("focus", _fn);
			});
		},

		setupUI : function(formId) {
			this.ui = new UI(formId);

			// radio select for play / pause / stop
			this.ui.addRadioSelect("", "state", {Play : "play", Pause : "pause", Stop : "stop"}, this.setState.bind(this));

			// radio select for channel (wave) type
			this.ui.addRadioSelect("CHANNEL : ", "channel", {Square : "square",
							   			  	Sine : "sine",
							                Sawtooth : "sawtooth",
							            	Triangle : "triangle",
							            	Noise : "noise"}, this.setChannel.bind(this));
			this.setChannel("square");

			// radio select for display option
			this.ui.addRadioSelect("DISPLAY : ", "display", {All : "all",
				   			  	One : "one"}, this.setDisplay.bind(this));

			// tempo input
			this.ui.addNumberInput("TEMPO : ", "tempoId", 120, 1, 300, this.setTempo.bind(this));
			this.setTempo(120);

			// reset all button
			this.ui.addButton("reset all", this.resetAll.bind(this));

			// reset channel button
			this.ui.addButton("reset channel", this.resetCurrentChannel.bind(this));
		},

		tempoToTimestep : function(tempo) {
			return (1000 / (tempo / 60)) / 4;
		},

		resetAll : function() {
			// for all channels
			for (var waveType in this.channels) {
				// stop playing oscillators
				for (var i = 0; i < 16; i++) {
					if (this.players[waveType].oscillators[i] != null) {
						this.players[waveType].stop(i);
					}
				}
				// reset grid
				var grid = this.channels[waveType];
				grid.array = grid.blankArray();
			}
		},

		resetCurrentChannel : function() {
			// stop current beat oscillators
			for (var i = 0; i < 16; i++) {
				if (this.players[this.currentGrid.id].oscillators[i] != null) {
					this.players[this.currentGrid.id].stop(i);
				}
			}
			// reset grid
			this.currentGrid.array = this.currentGrid.blankArray();
		},

		setChannel : function(waveType) {
			this.currentGrid = this.channels[waveType];
		},

		setDisplay : function(displayType) {
			this.displayView = displayType;
		},

		draw : function(screen) {
			if (this.displayView === "all") {
				var i = 0;
				for (var waveType in this.channels) {
					this.channels[waveType].draw(this, screen, this.currentBeat, true, i);
					i++;
				}
			} else {
				this.channels[this.currentGrid.id].draw(this, screen, this.currentBeat, false, i);
			}
		},

		step : function() {
			// for each channel
			for (var waveType in this.players) {
				var player = this.players[waveType];
				var grid = this.channels[waveType];

				// +1 since current beat starts on beat -1
				var prevCol = grid.array[this.currentBeat];
				var currentCol = grid.array[(this.currentBeat + 1) % 16];

				for (var i = 0; i < 16; i++) {
					// stop playing the previous column
					if (player.oscillators[i] != null) {
						player.stop(i);
					}

					// start playing the current column
					if (currentCol[i].active) {
						player.start(i);
					}
				}
			}

			this.currentBeat = (this.currentBeat + 1) % 16;
		}
	};


	UI = function(formId) {
		this.form = document.getElementById(formId);

		// prevent enter key from refreshing page
		this.form.onsubmit = function(e) {
			e.preventDefault();
		};
	};

	UI.prototype = {
		addButton : function(label, fn) {
			var div = document.createElement("div");
			var button = document.createElement("button");
			var text = document.createTextNode(label);
			this.form.appendChild(div).appendChild(button).appendChild(text);

			button.onclick = fn;
		},

		addRadioSelect : function(label, id, options, fn) {
			this.form.appendChild(document.createTextNode(label));
			var div = document.createElement("div");

			for (var i in options) {
				var opt = document.createElement("input");
				var text = document.createTextNode(i);

				opt.name = id;
				opt.type = "radio";
				opt.value = options[i];
				opt.id = options[i];
				div.appendChild(opt);

				// add a label for the radios to display as push buttons
				var l = document.createElement("label")
				l.className = options[i];
				l.htmlFor = options[i];
				l.innerHTML = opt.value;
				div.appendChild(l);
			}
			this.form.appendChild(div);

			// after all radio buttons are made
			// check the first radio button
			var radios = this.form.elements[id];
			radios[0].checked = true;

			// and add event listeners
			var self = this;
			for (var i = 0; i < radios.length; i++) {
				radios[i].onclick = function() {
					var checkedValue = self.getRadioVal(radios);
					fn(checkedValue);
				};
			}
		},

		getRadioVal : function(radios) {
		    var val;
		    
		    for (var i = 0; i < radios.length; i++) {
		        if (radios[i].checked) {
		            val = radios[i].value;
		            break;
		        }
		    }
		    return val;
		},

		addNumberInput : function(label, id, value, min, max, fn) {
			var input = document.createElement("input");
			input.id = id;
			input.type = "number";
			input.value = value;	// for display purposes only
			input.min = min;		// for display purposes only
			input.max = max;		// for display purposes only
			var min = min;
			var max = max;
			this.form.appendChild(document.createTextNode(label));
			this.form.appendChild(input);

			input.onchange = function() {
				var value = parseInt(input.value);
				input.value = (value > max) ? max : ((value < min) ? min : value);
				fn(input.value);
			};
		}
	};


	var Ticker = function() {
		this._id = 0;
		this._fns = {};
		var self = this;
		var tick = function() {
			for (var i in self._fns) {
				if (new Date().getTime() - self._fns[i].last > self._fns[i].time) {
					self._fns[i].fn();
					self._fns[i].last = new Date().getTime();
				}
			}
			requestAnimationFrame(tick);
		}
		tick();
	};

	Ticker.prototype = {
		every : function(time, fn) {
			this._fns[this._id] = {last : new Date().getTime(), time : time, fn : fn};
			return this._id++;
		},

		getTime : function() {
			return new Date().getTime();
		},

		delete : function(id) {
			delete this._fns[id];
		}
	};


	var Grid = function(id, width, height, cellSize, colors) {
		this.id = id;
		this.width = width;
		this.height = height;
		this.cellSize = cellSize;
		this.selectedCells = [];			// for clicking and dragging across multiple cells
		this.array = this.blankArray();
		this.colors = colors;
	}

	Grid.prototype = {
		blankArray : function() {
			var gridArray = [];
			for (var x = 0; x < this.width; x += this.cellSize) {
				var col = [];
				for (var y = 0; y < this.height; y += this.cellSize) {
					col.push({x : x, y : y, active : false});
				}
				gridArray.push(col);
			}
			return gridArray;
		},

		drawCell : function(screen, x, y, size, color, borderColor, minified, index) {
			var height;
			var padBorder;
			var padInside;
			var padBoth;
			var insideY;

			if (minified) {
				padBorder = 2;
				padInside = 2;
				padBoth = padBorder + padInside;
				height = ((size - padBoth * 2) / 5);
				insideY = Math.floor(y + ((4 - index) * height));
			} else {
				padBorder = 2;
				padInside = 2;
				padBoth = padBorder + padInside;
				height = size - padBoth * 2;
				insideY = y;
			}

			// outline: top, left, right, bottom
			screen.fillStyle = "#000000";
			screen.fillRect(x + padBorder, y + padBorder, size - padBorder * 2, padBorder);
			screen.fillRect(x + padBorder, y + padBorder, padBorder, size - padBorder * 2);
			screen.fillRect(x + size - padBorder * 2, y + padBorder, padBorder, size - padBorder * 2);
			screen.fillRect(x + padBorder, y + size - padBorder * 2, size - padBorder * 2, padBorder);

			// color
			screen.fillStyle = color;
			screen.fillRect(x + padBoth, insideY + padBoth, size - padBoth * 2, height);
		},

		// Returns [main color, border color]
		determineCellColors : function(sequencer, cell, col, y, highlightIndex) {
			if (cell.active) {
				return [this.colors.active[0], this.colors.active[1]];
			}

			// light color is a valid cell color only if the current state isn't STOP
 			if (col === highlightIndex && sequencer.currentState !== "stop") {
				return [this.colors.light[0], this.colors.light[1]];
			}

			if (col % 4 === 0) {
				return [this.colors.neutral[0], this.colors.neutral[1]];
			}
			
			return [this.colors.neutral[2], this.colors.neutral[0]];
		},

		draw : function(sequencer, screen, highlightIndex, minified, index) {
			var cell;
			var colorTuple;	// [main color, border color]

			for (var col = 0; col < this.array.length; col++) {
				for (var y = 0; y < this.array[0].length; y++) {
					cell = this.array[col][y];
					colorTuple = this.determineCellColors(sequencer, cell, col, y, highlightIndex);
					this.drawCell(screen, cell.x, cell.y, this.cellSize, colorTuple[0], colorTuple[1], minified, index);
				}
			}
		},

		mousePosToGridCell : function(pos) {
			var col = Math.floor(pos.y / this.cellSize);
			var row = Math.floor(pos.x / this.cellSize);
			return {x : row, y : col};
		},

		toggleCell : function(pos) {
			this.array[pos.x][pos.y].active = !this.array[pos.x][pos.y].active;
			return this.array[pos.x][pos.y].active;	// return the new state of the cell
		},

		setCell : function(pos, bool) {
			this.array[pos.x][pos.y].active = bool;
		},

		cellInArray : function(arr, cell) {
			for (var i = 0; i < arr.length; i++) {
				if (this.cellsAreEqual(arr[i], cell)) {
					return true;
				}
			}
			return false;
		},

		cellsAreEqual : function(cell1, cell2) {
			return (cell1.x === cell2.x && cell1.y === cell2.y);
		},

		addToSelectedCells : function(cell) {
			if (!this.cellInArray(this.selectedCells, cell)) {
				this.selectedCells.push(cell);
			}
		}
	};


	var SequencerMouseInput = function(canvas, sequencer) {
		this.mouser = new Mouser(canvas);
		this.lastClickState = true;			// was the last cell clicked on toggled to be active?	
		this.sequencer = sequencer;			// for access to the current grid

		this.mouser.on("mouseclick", partial([canvas], this.onMouseClick.bind(this)));
		this.mouser.on("mousedrag", partial([canvas], this.onMouseDrag.bind(this)));
	};

	SequencerMouseInput.prototype = {
		onMouseClick : function(canvas) {
			var clickedCell = this.sequencer.currentGrid.mousePosToGridCell(this.mouser.getPos());
			this.lastClickState = this.sequencer.currentGrid.toggleCell(clickedCell);
			this.sequencer.currentGrid.selectedCells = [];
		},

		onMouseDrag : function(canvas) {
			var currentSelectedCell = this.sequencer.currentGrid.mousePosToGridCell(this.mouser.getPos());

			// if the currently selected cell hasn't been updated already, update it
			if (!this.sequencer.currentGrid.cellInArray(this.sequencer.currentGrid.selectedCells, currentSelectedCell)) {
				this.sequencer.currentGrid.setCell(currentSelectedCell, this.lastClickState);
			}
			// and add it to the selected cells
			this.sequencer.currentGrid.addToSelectedCells(currentSelectedCell);
		}
	};


	var Mouser = function(target) {
		this._isDown = false;
		this._pos = {x : 0, y : 0};
		this.handlers = {};

		var lastMouseEvent;
		var self = this;

		// mousedown and mouseclick
		target.addEventListener("mousedown", function(e) {
			self._fireEvent(e);
			self.setPos(target);
			self._isDown = true;

			if (lastMouseEvent !== "mousedown") {
				self._fireEvent({ type: "mouseclick", 
					              offsetX: e.offsetX, offsetY: e.offsetY, 
					              pageX: e.pageX, pageY: e.pageY});
			}
			lastMouseEvent = "mousedown";
		});

		//mouseup
		target.addEventListener("mouseup", function(e) {
			self._fireEvent(e);
			self._isDown = false;
			lastMouseEvent = "mouseup";
		});

		//mousemove and mousedrag
		target.addEventListener("mousemove", function(e) {
			self._fireEvent(e);
			self.setPos(target);

			if (self.getIsDown()) {
				self._fireEvent({ type: "mousedrag", 
					              offsetX: e.offsetX, offsetY: e.offsetY, 
					              pageX: e.pageX, pageY: e.pageY});
			}
		});

		//mouseout
		target.addEventListener("mouseout", function(e) {
			self._fireEvent(e);
			self._isDown = false;
			lastMouseEvent = "mouseout";
		});

	};

	Mouser.prototype = {
		_fireEvent : function(event) {
			var handlers = this.handlers[event.type] || [];
			handlers.forEach(function(h) {
				h(event);
			});
		},

		on : function(type, fn) {
			this.handlers[type] = this.handlers[type] || [];
			this.handlers[type].push(fn);
		},

		setPos : function(target) {
			var rect = target.getBoundingClientRect();
			this._pos.x = event.offsetX || event.pageX - rect.left - window.scrollX;
	    	this._pos.y = event.offsetY || event.pageY - rect.top - window.scrollY;

	    	// clip to make sure the position is in bounds of the target area
	    	this._pos.x = Math.max(Math.min(this._pos.x, target.width), 0);
	    	this._pos.y = Math.max(Math.min(this._pos.y, target.height), 0);
		},

		getPos : function() {
			return this._pos;
		},

		getIsDown : function() {
			return this._isDown;
		}
	};


	var Player = function(startingPitch, numNotes, waveType, audioCtx) {
		this.startingPitch = startingPitch;
		this.endingPitch = startingPitch * Math.pow(2, (numNotes - 1)/12);
		this.waveType = waveType;
		this.audioCtx = audioCtx;
		this.oscillators = [];
		this.frequencies = [];		// a different frequency for each row

		for (var i = 0; i < numNotes; i++){
			this.frequencies.push(startingPitch * Math.pow(2, i/12));
		}
		this.frequencies.reverse(); // to order pitches from high to low
	};

	Player.prototype = {
		newOscillator : function(frequency, waveType) {
			if (waveType === "noise") {
				// the sample rate is in the range [3000, 192000]
				var normFrequency = (frequency - this.startingPitch) / (this.endingPitch - this.startingPitch);
				var frameRate = 3000 + normFrequency * (192000 - 3000);
				var sampleRate = frameRate;
				var buffer = this.audioCtx.createBuffer(1, frameRate, sampleRate);
				var data = buffer.getChannelData(0);

				for (i = 0; i < data.length; i++) {
				    data[i] = (Math.random() - 0.5) * 2 * 0.2;
				}

				var source = this.audioCtx.createBufferSource();
				source.loop = true;
				source.buffer = buffer;
				source.connect(this.audioCtx.destination);

				return source;
			}

			var oscillator = this.audioCtx.createOscillator();
			var gainNode = this.audioCtx.createGain();
			
			gainNode.gain.value = 0.2;
			oscillator.frequency.value = frequency;
			oscillator.type = waveType;
			
			oscillator.connect(gainNode);
			gainNode.connect(this.audioCtx.destination);
			return oscillator;
		},

		start : function(index) {
			this.oscillators[index] = this.newOscillator(this.frequencies[index], this.waveType);
			this.oscillators[index].start(0);
		},

		stop : function(index) {
			this.oscillators[index].stop();
			this.oscillators[index] = null;
		},
	};

	window.onload = function() {
		new Sequencer("canvasId", "formId", "tempoId");
	};

})();