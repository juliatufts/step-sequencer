;(function() {

	// Returns the function it is passed with the array of arguments already applied
	var partial = function(argArray, fn) {
		return function() {
			var args = Array.prototype.slice.call(arguments)
			fn.apply(null, argArray.concat(args))
		};
	};
	
	var Sequencer = function(canvasId, formId) {
		var canvas = document.getElementById(canvasId);
		var screen = canvas.getContext("2d");
		var audioCtx = new AudioContext();

		var ch = new Channel(16);
		console.log(ch);

		this.grid = new Grid(canvas.width, canvas.height, Math.floor(canvas.width / 16), ch);
		this.mouser = new Mouser(canvas, this.grid);
		this.player = new Player(261.626, 16, audioCtx); 	// C4 to Eb5
		this.currentBeat = 15;	// the beat increments right away, so start one before 0
		this.colors = {light : ["#24C0EB", "#5CCEEE"],			 		// blue, light blue
		               neutral : ["#424242", "#575757", "#000000"]};	// grey, light grey, black
		this.ticker = new Ticker();

		var self = this;
		var runSequencer = function() {
			self.step();
			self.draw(screen);
		};

		var lastId;
		this.setTempo = function(tempo) {
			// adjust tempo to be in range
			tempo = (tempo < 1) ? 1 : ((tempo > 300) ? 300 : tempo);
			this.ticker.delete(lastId);
			lastId = this.ticker.every(this.tempoToTimestep(tempo), runSequencer);
		} 

		this.setupUI(formId);
	};

	Sequencer.prototype = {
		setupUI : function(formId) {
			this.ui = new UI(formId);

			// reset button
			this.ui.addButton("Reset", this.reset.bind(this));

			// channel select for wave type
			this.ui.addSelect("Channel", {Square : "square",
							   			  	Sine : "sine",
							                Sawtooth : "sawtooth",
							            	Triangle : "triangle"}, this.setChannel.bind(this));
			this.setChannel("square");

			// tempo
			this.ui.addNumberInput("Tempo", 60, 1, 300, this.setTempo.bind(this));
			this.setTempo(60);
		},

		tempoToTimestep : function(tempo) {
			return (1000 / (tempo / 60)) / 4;
		},

		reset : function() {
			// stop current beat oscillators
			for (var i = 0; i < 16; i++) {
				if (this.player.oscillators[i] != null) {
					this.player.stop(i);
				}
			}
			// reset grid
			this.grid.array = this.grid.blankArray();
		},

		setChannel : function(waveType) {
			this.player.setChannelType(waveType);
		},

		draw : function(screen) {
			this.grid.draw(screen, this.currentBeat, this.colors);
		},

		step : function() {
			// +1 since current beat starts on beat -1
			var prevCol = this.grid.array[this.currentBeat];
			var currentCol = this.grid.array[(this.currentBeat + 1) % 16];
			
			for (var i = 0; i < 16; i++) {
				// stop playing the previous column
				if (prevCol[i].active && this.player.oscillators[i] != null) {
					this.player.stop(i);
				}

				// start playing the current column
				if (currentCol[i].active) {
					this.player.start(i);
				}
			}
			this.currentBeat = (this.currentBeat + 1) % 16;
		}
	};


	var Channel = function(numNotes) {
		var arr = [];
		for (var i = 0; i < numNotes; i++) {
			var col = [];
			for (var j = 0; j < numNotes; j++) {
				col.push(0);
			}
			arr.push(col);
		}

		this.notes = arr;
		this.waveType = "square";
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
			var button = document.createElement("button");
			var text = document.createTextNode(label);
			this.form.appendChild(button).appendChild(text);

			button.onclick = fn;
		},

		addSelect : function(label, options, fn) {
			var select = document.createElement("select");
			for (var i in options) {
				var opt = document.createElement("option");
				var text = document.createTextNode(i);
				opt.value = options[i];
				select.appendChild(opt).appendChild(text);
			}
			this.form.appendChild(document.createTextNode(label));
			this.form.appendChild(select);

			select.onchange = function() {
				fn(select.value);
			};
		},

		addNumberInput : function(label, value, min, max, fn) {
			var input = document.createElement("input");
			input.type = "number";
			input.value = value;
			input.min = min;
			input.max = max;
			this.form.appendChild(document.createTextNode(label));
			this.form.appendChild(input);

			input.onchange = function() {
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


	var Grid = function(width, height, cellSize, channel) {
		this.width = width;
		this.height = height;
		this.cellSize = cellSize;
		this.selectedCells = [];			// for clicking and dragging across multiple cells
		this.array = this.blankArray();
		this.channel = channel;
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

		drawCell : function(screen, x, y, size, color, borderColor) {
			screen.fillStyle = borderColor;
			screen.fillRect(x + 2, y + 2, size - 4, size - 4);

			screen.fillStyle = color;
			screen.fillRect(x + 4, y + 4, size - 8, size - 8);
		},

		// Returns [main color, border color]
		determineCellColors : function(cell, col, y, highlightIndex, colors) {
			if (cell.active) {
				// the active color is lighter for higher frequency notes (those with smaller y value)
				var r = Math.floor(100 * ((16 - y) / 16) + 30);
				var g = Math.floor((255 - 175) * ((16 - y) / 16) + 175);
				var b = Math.floor(100 * ((16 - y) / 16) + 30);

				var main = "rgb(" + r + "," + g + "," + b + ")";
				var border = "rgb(" + (r + 30) + "," + (g + 30) + "," + (b + 30) + ")";
				
				return [main, border];
			} else if (col === highlightIndex) {
				return [colors.light[0], colors.light[1]];
			} else if (col % 4 === 0) {
				return [colors.neutral[0], colors.neutral[1]];
			} else {
				return [colors.neutral[2], colors.neutral[0]];
			}
		},

		draw : function(screen, highlightIndex, colors) {
			var cell;
			var colorArray;	// [main color, border color]

			for (var col = 0; col < this.array.length; col++) {
				for (var y = 0; y < this.array[0].length; y++) {
					cell = this.array[col][y];
					colorArray = this.determineCellColors(cell, col, y, highlightIndex, colors);
					this.drawCell(screen, cell.x, cell.y, this.cellSize, colorArray[0], colorArray[1]);
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


	var Mouser = function(canvas, grid) {
		this.pos = {x : 0, y : 0};
		this.isDown = false;
		this.lastClickState = true;		// was the last cell clicked on active?

		// Event listeners for user input (mouse clicks)
		canvas.addEventListener("mousedown", partial([canvas, grid], this.onMouseDown.bind(this)));
		canvas.addEventListener("mouseup", partial([canvas], this.onMouseUp.bind(this)));
		canvas.addEventListener("mousemove", partial([canvas, grid], this.onMouseMove.bind(this)));
		canvas.addEventListener("mouseout", partial([canvas, grid], this.onMouseOut.bind(this)));
	};

	Mouser.prototype = {
		getIsDown : function() {
			return this.isDown;
		},

		getCoordinates : function() {
			return this.pos;
		},

		setCoordinates : function(canvas) {
			var rect = canvas.getBoundingClientRect();
			this.pos.x = event.offsetX || event.pageX - rect.left - window.scrollX;
	    	this.pos.y = event.offsetY || event.pageY - rect.top - window.scrollY;

	    	// clip to make sure the position is in bounds of the canvas
	    	this.pos.x = Math.max(Math.min(this.pos.x, canvas.width), 0);
	    	this.pos.y = Math.max(Math.min(this.pos.y, canvas.height), 0);
		},

		onMouseDown : function(canvas, grid, event) {
			this.setCoordinates(canvas);

			// is there a better way to do this? it'd be nice to have grid be separate from the mouser
			var clickedCell = grid.mousePosToGridCell(this.pos);
			this.lastClickState = grid.toggleCell(clickedCell);
			grid.selectedCells = [];
			
			this.isDown = true;
		},

		onMouseMove : function(canvas, grid, event) {
			// if the mouse is clicking and dragging
			if (this.isDown) {
				this.setCoordinates(canvas);
				var currentSelectedCell = grid.mousePosToGridCell(this.pos);

				// if the currently selected cell hasn't been updated already, update it
				if (!grid.cellInArray(grid.selectedCells, currentSelectedCell)) {
					grid.setCell(currentSelectedCell, this.lastClickState);
				}
				// and add it to the selected cells
				grid.addToSelectedCells(currentSelectedCell);
			}
		},

		onMouseUp : function(canvas, event) {
			this.isDown = false;
		},

		onMouseOut : function(canvas, grid, event) {
			this.isDown = false;
			grid.selectedCells = [];
		}
	};


	var Player = function(startingPitch, numNotes, audioCtx) {
		this.audioCtx = audioCtx;
		this.oscillators = [];
		this.frequencies = [];		// a different frequency for each row

		for (var i = 0; i < numNotes; i++){
			this.frequencies.push(startingPitch * Math.pow(2, i/12));
		}
		this.frequencies.reverse(); // to order pitches from high to low
	};

	Player.prototype = {
		setChannelType : function(type) {
			this.waveType = type;
		},

		newOscillator : function(frequency, waveType) {
			var oscillator = this.audioCtx.createOscillator();
			oscillator.frequency.value = frequency;
			oscillator.type = waveType;
			oscillator.connect(this.audioCtx.destination);
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
		new Sequencer("canvasId", "formId");
	};

})();