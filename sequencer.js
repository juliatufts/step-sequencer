;(function() {

	// Returns the function it is passed with the array of arguments already applied
	var partial = function(argArray, fn) {
		return function() {
			var args = Array.prototype.slice.call(arguments)
			fn.apply(null, argArray.concat(args))
		};
	};

	
	var Sequencer = function(canvasId) {

		var canvas = document.getElementById(canvasId);
		var screen = canvas.getContext("2d");
		var audioCtx = new AudioContext();

		this.grid = new Grid(canvas.width, canvas.height, Math.floor(canvas.width / 16));
		this.mouser = new Mouser(canvas, this.grid);
		this.player = new Player(261.626, 16); 				// C4 to Eb5
		this.colors = {light : ["#24C0EB", "#5CCEEE"], 		// main color and lighter border color, blue
		               active : ["#73D100", "#C8FF00"],		// green
		               neutral : ["#424242", "#575757"]};	// grey

		var date = new Date();
		var time = date.getTime();
		var stepInterval = 500; 	// time step interval in milliseconds	
		this.beatIndex = 0;			// the current beat (0-15)

		// main loop
		var self = this;
		var tick = function() {
			// every time step interval
			if (new Date().getTime() - time > stepInterval) {
				time = new Date().getTime();
				self.step(audioCtx);
			}

			// every frame
			self.draw(screen);
			requestAnimationFrame(tick);
		}

		tick();
	};

	Sequencer.prototype = {
		draw : function(screen) {
			this.grid.draw(screen, this.beatIndex, this.colors);
		},

		step : function(audioCtx) {

			this.beatIndex = (this.beatIndex + 1) % 16;
			var prevCol = this.grid.array[(this.beatIndex + 15) % 16];
			var currentCol = this.grid.array[this.beatIndex];
			
			for (var i = 0; i < 16; i++) {
				// stop playing the previous column
				// remember to only stop an oscillator if it's already playing
				if (prevCol[i].active && this.player.oscillators[i] != null) {
					this.player.stop(i);
				}

				// start playing the current column
				if (currentCol[i].active) {
					this.player.start(audioCtx, i);
				}
			}
		}
	};


	var Grid = function(width, height, cellSize) {
		var gridArray = [];
		for (var x = 0; x < width; x += cellSize) {
			var col = [];
			for (var y = 0; y < height; y += cellSize) {
				col.push({x : x, y : y, active : false});
			}
			gridArray.push(col);
		}

		this.array = gridArray;
		this.cellSize = cellSize;
	}

	Grid.prototype = {
		drawCell : function(screen, x, y, size, color, borderColor) {
			screen.fillStyle = borderColor;
			screen.fillRect(x + 2, y + 2, size - 4, size - 4);

			screen.fillStyle = color;
			screen.fillRect(x + 4, y + 4, size - 8, size - 8);
		},

		draw : function(screen, highlightIndex, colors) {
			var cell;
			var color;
			var borderColor;

			for (var col = 0; col < this.array.length; col++) {
				for (var y = 0; y < this.array[0].length; y++) {
					cell = this.array[col][y];
					if (cell.active) {
						color = colors.active[0];
						borderColor = colors.active[1];
					} else if (col === highlightIndex) {
						color = colors.light[0];
						borderColor = colors.light[1];
					} else {
						color = colors.neutral[0];
						borderColor = colors.neutral[1];
					}
					this.drawCell(screen, cell.x, cell.y, this.cellSize, color, borderColor);
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
		}
	};


	var Mouser = function(canvas, grid) {
		this.pos = {x : 0, y : 0};
		this.isDown = false;

		// Event listeners for user input (mouse clicks)
		canvas.addEventListener("mousedown", partial([canvas, grid], this.onMouseDown.bind(this)));
		canvas.addEventListener("mouseup", partial([canvas], this.onMouseUp.bind(this)));
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
		},

		onMouseDown : function(canvas, grid, event) {
			this.setCoordinates(canvas);

			// is there a better way to do this? 
			// It would be ideal to have the grid be separate from the mouser
			var clickedCell = grid.mousePosToGridCell(this.pos);
			grid.toggleCell(clickedCell);
			
			this.isDown = true;
		},

		onMouseUp : function(canvas, event) {
			this.isDown = false;
		}
	};


	var Player = function(startingPitch, numNotes) {
		this.frequencies = [];
		for (var i = 0; i < numNotes; i++){
			this.frequencies.push(startingPitch * Math.pow(2, i/12));
		}
		this.frequencies.reverse(); // to order pitches from high to low

		this.oscillators = [];
		for (var i = 0; i < this.oscillators.length; i++) {
			this.oscillators.push(null);
		}
	};

	Player.prototype = {
		newOscillator : function(audioCtx, frequency) {
			var oscillator = audioCtx.createOscillator();
			oscillator.frequency.value = frequency;
			oscillator.connect(audioCtx.destination);
			return oscillator;
		},

		start : function(audioCtx, index) {
			this.oscillators[index] = this.newOscillator(audioCtx, this.frequencies[index]);
			this.oscillators[index].start(0);
		},

		stop : function(index) {
			this.oscillators[index].stop();
			this.oscillators[index] = null;
		},
	};


	window.onload = function() {
		new Sequencer("canvasId");
	};

})();