var _requestAnimationFrame = (function() {
	if (typeof window !== 'undefined' && 'requestAnimationFrame' in window)
		return function(callback) {
			window.requestAnimationFrame(callback);
		};
	else {
		var timeout = null;
		return function(callback) {
			clearTimeout(timeout);
			timeout = setTimeout(callback, 10);
		};
	}
})();

function Claim(graph, text, data)
{
	this.graph = graph;
	this.text = text.split(/\n/);
	this.data = data || {};
	this.ax = 0;
	this.ay = 0;
	this.dx = 0;
	this.dy = 0;
	this.width = null;
	this.height = null;
}

Claim.prototype = {
	setPosition: function(x, y) {
		this.ax = x;
		this.ay = y;
	},
	
	delete: function() {
		// Remove the claims from the graph
		this.graph.claims = this.graph.claims.filter(claim => claim !== this);

		// Also from the current selection
		this.graph.selectedClaims = this.graph.selectedClaims.filter(claim => claim !== this);

		// And delete any of the relations that are connected to this claim
		this.graph.relations.forEach(relation => {
			if (relation.claim === this || relation.target === this)
				relation.delete();
		});
	},
	
	get x() {
		return this.ax + this.dx;
	},
	
	get y() {
		return this.ay + this.dy;
	},

	get center() {
		return {
			x: this.x + 0.5 * this.width,
			y: this.y + 0.5 * this.height
		};
	}
}

function Relation(graph, claim, target, type, data) {
	this.graph = graph;
	this.claim = claim;
	this.target = target;
	this.type = type;
	this.data = data || {};
}

Relation.SUPPORT = 'support';

Relation.ATTACK = 'attack';

Relation.CONDITION = 'warrant';

Relation.EXCEPTION = 'undercut';

Relation.prototype = {
	delete: function() {
		// Delete the relation from the graph
		this.graph.relations.forEach(function(relation) {
			if (relation.target === this)
				relation.delete();
		}, this);

		// And also delete any relation that targets this relation
		this.graph.relations = this.graph.relations.filter(function(relation) {
			return relation !== this;
		}, this);
	},

	get x() {
		return this.claim.x + (this.target.x - this.claim.x) / 2;
	},
	
	get y() {
		return this.claim.y + (this.target.y - this.claim.y) / 2;
	},
	
	get width() {
		return 1;
	},
	
	get height() {
		return 1;
	},
	
	get center() {
		return {
			x: this.claim.center.x + (this.target.center.x - this.claim.center.x) / 2,
			y: this.claim.center.y + (this.target.center.y - this.claim.center.y) / 2
		};
	}
}


function typerepr(obj)
{
	if (obj === undefined)
		return 'undefined';
	if (obj === null)
		return 'null';
	if (obj.constructor)
		return obj.constructor.name;
	return typeof obj;
}


class LetterSequence {
	constructor() {
		this.counter = 0;
	}

	next() {
		let val = this.toString();
		++this.counter;
		return val;
	}

	toString() {
		let value = this.counter;
		let chars = '';
		
		if (value === 0) {
			return 'a';
		}

		while (value > 0) {
			chars = ((value % 26) + 10).toString(36) + chars;
			value = Math.floor(value / 26);
		}

		return chars;
	}
}


function Graph(canvas)
{
	this.canvas = canvas;

	this.context = this.canvas.getContext('2d');

	this.claims = [];
	this.relations = [];

	this.selectedClaims = [];
	this.dragStartPosition = null;
	this.wasDragging = false;
	this.cursor = null;

	this.listeners = {
		'draw': [],
		'drop': []
	};

	if ('addEventListener' in this.canvas) {
		this.canvas.tabIndex = -1;
		this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
		this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
		this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
		this.canvas.addEventListener('mouseout', this.onMouseOut.bind(this));
		this.canvas.addEventListener('dblclick', this.onDoubleClick.bind(this));
		this.canvas.addEventListener('keydown', this.onKeyDown.bind(this));
		this.canvas.addEventListener('keyup', this.onKeyUp.bind(this));
		this.canvas.addEventListener('focus', this.update.bind(this));
		this.canvas.addEventListener('blur', this.update.bind(this));
	}

	var scopeStyles = {};

	var colours = [
		"#ff0000", "#ffee00", "#5395a6", "#40002b", "#f20000", "#7f7920",
		"#6c98d9", "#d9a3bf", "#e58273", "#807d60", "#3d3df2", "#ff408c",
		"#ff8c40", "#5ccc33", "#110080", "#8c2331", "#e6c3ac", "#004d29",
		"#282633", "#593c00", "#00bf99", "#b32daa"
	];

	this.style = {
		scale: typeof window !== 'undefined' && 'devicePixelRatio' in window ? window.devicePixelRatio : 1.0,
		padding: 20,
		claim: {
			padding: 5,
			fontSize: 13,
			lineHeight: 16,
			background: function(claim) {
				return 'white';
			},
			fontColor: function(claim) {
				return claim.data.assumption ? '#ccc' : 'black';
			},
			fontStyle: function(claim) {
				return claim.data.assumption ? 'italic' : '';
			},
			border: function(claim) {
				if (claim.data.scope) {
					if (!(claim.data.scope in scopeStyles))
						scopeStyles[claim.data.scope] = colours.pop();
					
					return scopeStyles[claim.data.scope];
				}

				return claim.data.assumption ? '#ccc' : 'black';
			}
		},
		relation: {
			size: 5,
			color: function(relation) {
				return relation.data.assumption ? '#ccc' : 'black';
			},
			dash: function(relation) {
				return relation.type === Relation.CONDITION || relation.type === Relation.EXCEPTION ? [5, 5] : [];
			}
		}
	};

	// this.input = document.createElement('input');
	// this.input.type = 'text';
	// this.input.style.position = 'absolute';
	// this.input.style.display = 'none';
	// this.canvas.parentNode.appendChild(this.input);

	if (typeof window !== 'undefined' && 'addEventListener' in window)
		window.addEventListener('resize', this.resize.bind(this));

	this.updateCanvasSize();
}

Graph.Claim = Claim;

Graph.prototype = {
	addClaim: function(text, data) {
		let claim = new Claim(this, text, data);
		this.claims.push(claim);
		this.update();
		return claim;
	},

	addRelation: function(claim, target, type, data) {
		if (Array.isArray(claim)) {
			if (claim.length === 0) {
				return null;
			}
			else if (claim.length > 1) {
				// We need a compound statement to merge stuff
				let compound = this.addClaim('&', {compound: true});

				claim.forEach(function(claim) {
					this.addRelation(claim, compound, null, data);
				}, this);

				return this.addRelation(compound, target, type, Object.assign({}, data, {merged: true}));
			}
			else {
				// Treat it as a single argument
				claim = claim[0];
			}
		}

		if (!(claim instanceof Claim))
			throw new TypeError('Claim should be instance of Claim, is ' + typerepr(target));

		if (!(target instanceof Claim) && !(target instanceof Relation))
			throw new TypeError('Target should be instance of Claim or Relation, is ' + typerepr(target));

		var relation = new Relation(this, claim, target, type, data);
		this.relations.push(relation);
		this.update();

		return relation;
	},

	findRootClaims: function() {
		if (this.claims.length == 0)
			return [];
		
		// Find all claims that are the source for a relation
		const sources = this.relations.map(relation => relation.claim);

		// Now filter from all known claims those source claims
		const roots = this.claims.filter(claim => sources.indexOf(claim) === -1);

		// and we should be left with the roots
		// (which are only attacked or supported, or neither)
		if (roots.length > 0)
			return roots;

		// Oh crap, only circular claims. Great! Let's just take the first one added.
		return [this.claims[0]];
	},

	findRelations: function(criteria) {
		// You can pass in an array of conditions to get the joined set, for example
		// when you pass in [{claim: x}, {target: x}], you get all relations that
		// have either the claim or the target as x. When you pass in [{claim: x, target: x}]
		// you only get the relations that have both X as the claim and target at the same time.

		if (!Array.isArray(criteria))
			criteria = [criteria];

		function test(relation) {
			return criteria.some(condition => {
				return (!('claim' in condition) || relation.claim === condition.claim)
					&& (!('target' in condition) || relation.target === condition.target)
					&& (!('type' in condition || relation.type === condition.type));
			});
		};

		return this.relations.filter(test);
	},

	findClaimAtPosition: function(pos) {
		return this.claims.find(claim => {
			return pos.x > claim.x + this.style.padding
				&& pos.y > claim.y + this.style.padding
				&& pos.x < claim.x + this.style.padding + claim.width
				&& pos.y < claim.y + this.style.padding + claim.height;
		});
	},

	onMouseDown: function(e) {
		if (e.altKey)
			return;

		this.wasDragging = false;

		this.dragStartPosition = {
			x: e.offsetX,
			y: e.offsetY
		};

		let claim = this.findClaimAtPosition({x: e.offsetX, y: e.offsetY});

		if (claim && !this.selectedClaims.includes(claim)) {
			if (e.shiftKey)
				this.selectedClaims.push(claim);
			else
				this.selectedClaims = [claim];

			this.update();
		}
	},

	onDoubleClick: function(e) {
		let claim = this.findClaimAtPosition({x: e.offsetX, y: e.offsetY});

		if (claim)
			return;

		let text = prompt('ID');

		claim = this.addClaim(text);
		claim.setPosition(e.offsetX, e.offsetY);
	},

	onMouseMove: function(e) {
		if (this.dragStartPosition === null) {
			if (this.findClaimAtPosition({x: e.offsetX, y: e.offsetY}))
				this.canvas.style.cursor = 'pointer';
			else
				this.canvas.style.cursor = 'default';

			if (e.altKey) {
				this.cursor = {
					x: e.offsetX - this.style.padding,
					y: e.offsetY - this.style.padding,
					type: e.shiftKey ? Relation.ATTACK : Relation.SUPPORT
				};
				
				this.update();
			}
		} else {
			const delta = {
				x: e.offsetX - this.dragStartPosition.x,
				y: e.offsetY - this.dragStartPosition.y
			};

			// If we have been dragging a bit, cancel the onClick
			if (Math.abs(delta.x) > 2 || Math.abs(delta.y) > 2)
				this.wasDragging = true;

			this.selectedClaims.forEach(claim => {
				claim.dx = delta.x;
				claim.dy = delta.y;
			});

			this.update();
		}
	},

	onMouseUp: function(e) {
		e.preventDefault();

		this.canvas.style.cursor = 'default';

		if (!this.wasDragging) {
			let claim = this.findClaimAtPosition({x: e.offsetX, y: e.offsetY});

			if (e.altKey) {
				if (claim && this.selectedClaims.length > 0) {
					this.addRelation(
						this.selectedClaims[0],
						claim,
						e.shiftKey ? Relation.ATTACK : Relation.SUPPORT);
				}
			} else {
				if (!claim && this.selectedClaims.length != 0) {
					this.selectedClaims = [];
					this.update();
				}
			}
		}
		else if (this.selectedClaims.length > 0) {
			this.selectedClaims.forEach(claim => {
				claim.ax += claim.dx;
				claim.ay += claim.dy;
				claim.dx = 0;
				claim.dy = 0;
			});

			this.fire('drop');
		}
		
		this.dragStartPosition = null;
	},

	onMouseOut: function(e) {
		if (this.cursor) {
			this.cursor = null;
			this.update();
		}
	},

	onKeyDown: function(e) {
		const stepSize = 2 * this.style.scale;

		switch (e.keyCode) {
			case 8: // Backspace
			case 46: // Delete
				this.selectedClaims.forEach(claim => claim.delete());
				e.preventDefault();
				this.update();
				break;

			case 9: // Capture [tab] key
				// If there are no claims, there is nothing to move focus to
				if (this.claims.length === 0)
					return;

				var direction = e.shiftKey ? -1 : 1;
				var idx = -1;
				
				// Find the first claim in selectedClaims
				if (this.selectedClaims.length > 0)
					idx = this.claims.indexOf(this.selectedClaims[0]);

				if (idx < this.claims.length - 1)
					this.selectedClaims = [this.claims[(this.claims.length + idx + direction) % this.claims.length]];
				else
					this.selectedClaims = [];

				e.preventDefault();
				this.update();
				break;

			case 40: // down
				this.selectedClaims.forEach(claim => {
					claim.ay += stepSize;
				});
				e.preventDefault();
				this.update();
				break;

			case 38: // up
				this.selectedClaims.forEach(claim => {
					claim.ay -= stepSize;
				});
				e.preventDefault();
				this.update();
				break;

			case 37: // left
				this.selectedClaims.forEach(claim => {
					claim.ax -= stepSize;
				});
				e.preventDefault();
				this.update();
				break;

			case 39: // right
				this.selectedClaims.forEach(claim => {
					claim.ax += stepSize;
				});
				e.preventDefault();
				this.update();
				break;

			case 16: // Shift
			case 18: // Alt
				this.update();
				break;
		}
	},

	onKeyUp: function(e) {
		switch (e.keyCode) {
			case 16: // Shift
			case 18: // Alt
				this.cursor = null;
				this.update();
				break;
		}
	},

	on: function(eventName, callback) {
		this.listeners[eventName].push(callback);
	},

	off: function(eventName, callback) {
		this.listeners[eventName] = this.listeners[eventName].filter(registeredCallback => callback !== registeredCallback);
	},

	fire: function(eventName) {
		this.listeners[eventName].forEach(callback => callback(this));
	},

	resize: function() {
		_requestAnimationFrame(() => {
			this.draw();
		});
	},

	fit: function() {
		// Find initial offsets
		const startX = this.claims.map(claim => claim.x).min();
		const startY = this.claims.map(claim => claim.y).min();

		// Remove that empty offset
		this.claims.forEach(claim => {
			claim.setPosition(
				claim.x - startX,
				claim.y - startY);
		});

		this.resize();
	},

	fitVertically: function() {
		// Find initial offsets
		const startY = this.claims.map(claim => claim.y).min();

		// Remove that empty offset
		this.claims.forEach(claim => {
			claim.setPosition(
				claim.x,
				claim.y - startY + this.style.scale);
		});

		// Find outer limits
		const height = this.claims.map(claim => claim.y + claim.height).max();

		this.resize();
	},

	destroy: function() {
		this.canvas.parentNode.removeChild(this.canvas);
	},

	updateCanvasSize: function(e) {
		const width = 2 * this.style.padding + this.claims.map(claim => claim.x + claim.width).max();

		const height = 2 * this.style.padding + this.claims.map(claim => claim.y + claim.height).max();

		this.canvas.width = this.style.scale * width;
		this.canvas.height = this.style.scale * height;

		if ('style' in this.canvas) {
			this.canvas.style.width = width + 'px';
			this.canvas.style.height = height + 'px';
		}
	},

	updateClaimSizes: function() {
		this.context.font = (this.style.scale * this.style.claim.fontSize) + 'px sans-serif';

		this.claims.forEach(claim => {
			if (claim.width === null || claim.height === null) {
				if (claim.data.compound) {
					claim.width = 0;
					claim.height = 0;
				} else {
					let textWidth = claim.text.map(line => this.context.measureText(line).width).max();
					claim.width = textWidth / this.style.scale + 2 * this.style.claim.padding;
					claim.height = claim.text.length * this.style.claim.lineHeight + 2 * this.style.claim.padding;
				}
			}
		});
	},

	update: function() {
		_requestAnimationFrame(this.draw.bind(this));
	},

	draw: function() {
		// Update the size of all the claim boxes
		this.updateClaimSizes();

		// Make sure all the boxes will fit inside the canvas
		this.updateCanvasSize();

		// Clear the canvas
		this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

		// Translate for the padding (simplifies drawing commands immensely)
		this.context.translate(
			this.style.padding * this.style.scale,
			this.style.padding * this.style.scale);

		this.context.strokeStyle = '#000';
		this.context.fillStyle = 'black';
		this.context.lineWidth = this.style.scale * 1;

		this.drawRelations();

		this.drawClaims();

		this.drawSelection();

		this.drawCursor();
		
		this.fire('draw');
		
		// Undo the translation
		this.context.setTransform(1, 0, 0, 1, 0, 0);
	},

	drawClaims: function()
	{
		var ctx = this.context,
			padding = this.style.claim.padding,
			scale = this.style.scale,
			claimColor = this.style.claim.background,
			claimBorder = this.style.claim.border,
			fontColor = this.style.claim.fontColor,
			fontSize = this.style.claim.fontSize,
			fontStyle = this.style.claim.fontStyle,
			lineHeight = this.style.claim.lineHeight;

		// Sort claims with last selected drawn last (on top)
		this.claims.slice().sort((a, b) => this.selectedClaims.indexOf(a) - this.selectedClaims.indexOf(b));

		// Draw all claims
		this.claims.forEach(claim => {
			if (claim.data.compound)
				return;

			// Draw the background
			ctx.fillStyle = claimColor(claim);
			ctx.fillRect(
				scale * claim.x,
				scale * claim.y,
				scale * claim.width,
				scale * claim.height);

			// Draw the border
			ctx.strokeStyle = claimBorder(claim);
			ctx.lineWidth = scale * 1;
			ctx.strokeRect(
				scale * claim.x,
				scale * claim.y,
				scale * claim.width,
				scale * claim.height);

			// Set the font
			ctx.font = [fontStyle(claim), (scale * fontSize) + 'px','sans-serif'].join(' ');

			// Draw the inner text
			ctx.fillStyle = fontColor(claim);
			claim.text.forEach(function(line, i) {
				ctx.fillText(line,
					scale * (claim.x + padding),
					scale * (claim.y + padding / 2 + (i + 1) * lineHeight));
			});
		});
	},

	drawSelection: function()
	{
		var ctx = this.context,
			scale = this.style.scale;

		var color = typeof document !== 'undefined' && document.activeElement == this.canvas ? 'blue' : 'gray';

		ctx.lineWidth = scale * 3;
		ctx.strokeStyle = color;
		
		// Draw an extra outline for the selected claims
		this.selectedClaims.forEach(claim => {
			ctx.strokeRect(
				scale * (claim.x - 2),
				scale * (claim.y - 2),
				scale * (claim.width + 4),
				scale * (claim.height + 4));
		});
	},

	drawRelations: function()
	{
		let ctx = this.context,
			relationColor = this.style.relation.color,
			relationDash = this.style.relation.dash;

		// Draw all the relation arrows
		this.relations.forEach(relation => {
			// Offset the target position of the line a bit towards the border. So that
			// when drawing an arrow, we draw it towards the border, and not the center
			// where it will be behind the actual box.

			var s = this.offsetPosition(relation.target, relation.claim);
			// var s = relation.claim;

			var t = this.offsetPosition(relation.claim, relation.target);

			ctx.strokeStyle = relationColor(relation);

			ctx.setLineDash = relationDash(relation);

			this.drawRelationLine(s, t, relation.type);
		});
	},

	drawRelationLine: function(s, t, type)
	{
		let ctx = this.context,
			scale = this.style.scale,
			arrowRadius = this.style.relation.size;

		ctx.lineWidth = scale * 1;

		ctx.beginPath();
		ctx.moveTo(scale * s.x, scale * s.y);

		// To almost the target (but a bit less)
		let angle = Math.atan2(
			t.y - s.y,
			t.x - s.x);

		switch (type) {
			case Relation.SUPPORT:
			case Relation.CONDITION:
				ctx.lineTo(
					scale * t.x - scale * arrowRadius * Math.cos(angle),
					scale * t.y - scale * arrowRadius * Math.sin(angle));
				ctx.stroke();

				if (relation.type === Relation.SUPPORT)
					ctx.lineWidth = scale * 2;
				else
					ctx.lineWidth = scale * 1;
			
				ctx.setLineDash([]);
				ctx.arrow(scale * arrowRadius, 
					scale * s.x,
					scale * s.y,
					scale * t.x,
					scale * t.y);

				if (relation.type === Relation.SUPPORT)
					ctx.fill();
				else
					ctx.stroke();
				break;

			case Relation.ATTACK:
			case Relation.EXCEPTION:
				ctx.lineTo(
					scale * t.x - scale * arrowRadius * Math.cos(angle),
					scale * t.y - scale * arrowRadius * Math.sin(angle));
				ctx.stroke();

				if (relation.type === Relation.ATTACK)
					ctx.lineWidth = scale * 2;
				else
					ctx.lineWidth = scale * 1;

				ctx.setLineDash([]);
				ctx.cross(0.75 * scale * arrowRadius, 
					scale * s.x,
					scale * s.y,
					scale * t.x,
					scale * t.y);
				ctx.stroke();
				break;

			default:
				ctx.lineTo(
					scale * t.x,
					scale * t.y);
				ctx.stroke();
				break;
		}
	},

	drawCursor: function()
	{
		if (!this.cursor || this.selectedClaims.length === 0)
			return;

		let ctx = this.context,
			relationColor = this.style.relation.color;

		let claim = this.selectedClaims[0];

		this.drawRelationLine(claim.center, this.cursor, this.cursor.type);
	},

	offsetPosition: function(sourceBox, targetBox) {
		function center(box) {
			return {
				x: box.center.x,
				y: box.center.y,
				width: box.width,
				height: box.height
			};
		}

		const source = center(sourceBox);
		const target = center(targetBox);

		if (target.width === 0 || target.height === 0)
			return {x: target.x, y: target.y};

		const D = {
			x: source.x - target.x,
			y: source.y - target.y
		};

		let t = {
			x: target.x + (target.x > source.x ? -0.5 : 0.5) * target.width,
			y: target.y + (D.y / D.x) * (target.x > source.x ? -0.5 : 0.5) * target.width
		};

		// console.log(
		// 	D.x / D.y * target.height < -0.5 * target.width,
		// 	D.y / D.x * target.width < -0.5 * target.height
		// );

		if ((D.x / D.y < target.width / target.height)
			&& !(D.x / D.y * target.height < -0.5 * target.width))
			t = {
				x: target.x + (D.x / D.y) * (target.y > source.y ? -0.5 : 0.5) * target.height,
				y: target.y + (target.y > source.y ? -0.5 : 0.5) * target.height
			};

		return t;
	},

	parse: function(input)
	{
		let variables = {};

		let lines = input.split(/\r?\n/);

		let rules = [
			{
				pattern: /^\s*([a-z0-9]+)\s*:\s*(assume\s+)?((?:[a-z]+\s+)+)(?:(support|attack|warrant|undercut)s)\s+([a-z]+)$/,
				processor: match => {
					let sources = match[3].split(/\s+/).filter(name => name != '').map(name => {
						if (!(name in variables))
							throw new Error('Variable "' + name + '" is unknown');
						return variables[name];
					});
					let target = variables[match[5]];
					let relation = this.addRelation(sources, target, match[4], {variable: match[1], assumption: match[2] == 'assume'});
					variables[match[1]] = relation;
				}
			},
			{
				pattern: /^\s*([a-z0-9]+)\s*:\s*(assume\s+)?(.+?)\s*$/,
				processor: match => {
					variables[match[1]] = this.addClaim(match[3], {variable: match[1], assumption: match[2] == 'assume'});
				}
			}
		];

		lines.forEach((line, index) => {
			for (const rule of rules) {
				try {
					let match = line.match(rule.pattern);
					if (match) {
						rule.processor(match, line);
						break;
					}
				} catch (e) {
					throw new Error('Parse error on line ' + (index + 1) + ': ' + e.message);
				}
			}
		});
	},

	toString: function() {
		let variables = new LetterSequence();

		let mapping = new Map();

		let lines = [];

		this.claims.forEach(claim => {
			// Skip the compound nodes
			if (claim.data.compound)
				return;

			let variable = variables.next();

			let line = [variable + ':'];

			mapping.set(claim, variable);

			if (claim.data.assumption)
				line.push('assume');

			line.push(claim.text.join(" "));

			lines.push(line.join(' '));
		});

		this.relations.forEach(relation => {
			// Skip the relations that link to compound nodes.
			// We handle those at the compound nodes.
			if (relation.target.data.compound)
				return;

			let variable = variables.next();

			let line = [variable + ':'];

			// Save the variable for later references
			mapping.set(relation, variable);

			// Find the sources: If it is a merged relation, go
			// to the relations that link to the originating
			// compound claim and get their origin. Otherwise
			// just get the origin of the relation.
			let sources = relation.data.merged
				? this.relations
					.filter(rel => rel.target === relation.claim)
					.map(rel => rel.claim)
				: [relation.claim];
			
			// If either the original relation is an assumption, or
			// it is a merged relation and all sources are assumptions,
			// this relation will be marked as an assumption.
			if (relation.data.assumption || relation.data.merged && sources.filter(rel => !rel.data.assumption).length == 0)
				line.push('assume');

			// Add all the variables of the sources
			line.push.apply(line, sources.map((source) => mapping.get(source)));

			// Add the type
			line.push(relation.type + 's');

			// Add the target
			line.push(mapping.get(relation.target));

			// Done!
			lines.push(line.join(' '));
		});

		return lines.join("\n");
	}
}

if (typeof exports !== 'undefined') {
	exports.Claim = Claim;
	exports.Relation = Relation;
	exports.Graph = Graph;
}