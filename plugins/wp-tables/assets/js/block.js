/**
 * Klyna Tables — Gutenberg block (editor side).
 *
 * Classic registration against the wp.* globals so it needs no build step.
 * The block is server-rendered; in the editor we show a lightweight preview
 * placeholder plus an inspector to pick the table (or switch to product mode).
 */
( function ( blocks, element, blockEditor, components, i18n ) {
	'use strict';

	var el = element.createElement;
	var __ = i18n.__;
	var useBlockProps = blockEditor.useBlockProps;
	var InspectorControls = blockEditor.InspectorControls;
	var PanelBody = components.PanelBody;
	var SelectControl = components.SelectControl;
	var RangeControl = components.RangeControl;
	var TextControl = components.TextControl;
	var Placeholder = components.Placeholder;

	var boot = window.KlynaTablesBlock || { tables: [], hasWoo: false, adminUrl: '#' };

	var tableOptions = [ { label: __( '— Select a table —', 'wp-tables' ), value: 0 } ].concat(
		boot.tables.map( function ( tableItem ) {
			return { label: tableItem.title + ' (#' + tableItem.id + ')', value: tableItem.id };
		} )
	);

	var modeOptions = [ { label: __( 'Saved table', 'wp-tables' ), value: 'table' } ];
	if ( boot.hasWoo ) {
		modeOptions.push( { label: __( 'WooCommerce products', 'wp-tables' ), value: 'products' } );
	}

	var icon = el(
		'svg',
		{ width: 24, height: 24, viewBox: '0 0 24 24' },
		el( 'rect', { x: 2, y: 2, width: 20, height: 20, rx: 5, fill: '#7c5cff' } ),
		el( 'path', {
			d: 'M3 9h18M3 15h18M9 3v18M15 3v18',
			stroke: '#fff',
			strokeWidth: 1.8,
			fill: 'none'
		} )
	);

	blocks.registerBlockType( 'klyna/table', {
		apiVersion: 2,
		title: __( 'Klyna Table', 'wp-tables' ),
		description: __( 'Insert a responsive, sortable, searchable table or WooCommerce product list.', 'wp-tables' ),
		icon: icon,
		category: 'widgets',
		keywords: [ __( 'table', 'wp-tables' ), __( 'data', 'wp-tables' ), __( 'products', 'wp-tables' ) ],
		attributes: {
			tableId: { type: 'integer', default: 0 },
			mode: { type: 'string', default: 'table' },
			limit: { type: 'integer', default: 50 },
			category: { type: 'string', default: '' }
		},

		edit: function ( props ) {
			var attrs = props.attributes;
			var setAttrs = props.setAttributes;
			var blockProps = useBlockProps();

			var inspector = el(
				InspectorControls,
				{},
				el(
					PanelBody,
					{ title: __( 'Table source', 'wp-tables' ), initialOpen: true },
					el( SelectControl, {
						label: __( 'Source', 'wp-tables' ),
						value: attrs.mode,
						options: modeOptions,
						onChange: function ( value ) {
							setAttrs( { mode: value } );
						}
					} ),
					attrs.mode === 'table'
						? el( SelectControl, {
							label: __( 'Table', 'wp-tables' ),
							value: attrs.tableId,
							options: tableOptions,
							onChange: function ( value ) {
								setAttrs( { tableId: parseInt( value, 10 ) || 0 } );
							}
						} )
						: el(
							element.Fragment,
							{},
							el( RangeControl, {
								label: __( 'Max products', 'wp-tables' ),
								value: attrs.limit,
								min: 1,
								max: 200,
								onChange: function ( value ) {
									setAttrs( { limit: value } );
								}
							} ),
							el( TextControl, {
								label: __( 'Category slug (optional)', 'wp-tables' ),
								value: attrs.category,
								onChange: function ( value ) {
									setAttrs( { category: value } );
								}
							} )
						)
				)
			);

			var label;
			if ( attrs.mode === 'products' ) {
				label = __( 'WooCommerce product table', 'wp-tables' );
			} else if ( attrs.tableId ) {
				var match = boot.tables.filter( function ( tableItem ) {
					return tableItem.id === attrs.tableId;
				} )[ 0 ];
				label = match ? match.title : __( 'Selected table', 'wp-tables' );
			} else {
				label = __( 'Choose a table in the block settings', 'wp-tables' );
			}

			var preview = el(
				Placeholder,
				{
					icon: icon,
					label: __( 'Klyna Table', 'wp-tables' ),
					instructions: label
				}
			);

			return el( 'div', blockProps, inspector, preview );
		},

		// Server-rendered: nothing persisted to post_content.
		save: function () {
			return null;
		}
	} );
}(
	window.wp.blocks,
	window.wp.element,
	window.wp.blockEditor,
	window.wp.components,
	window.wp.i18n
) );
