/**
 * Klyna Forms — Gutenberg block.
 *
 * A dynamic block: the editor only picks which form to embed; rendering is
 * done server-side by Render::render_block(). Built without JSX so it can ship
 * unbundled — React is read off the global `wp.element`.
 */
( function ( blocks, element, blockEditor, components, data, i18n ) {
	'use strict';

	var el = element.createElement;
	var __ = i18n.__;
	var useBlockProps = blockEditor.useBlockProps;
	var useSelect = data.useSelect;
	var SelectControl = components.SelectControl;
	var Placeholder = components.Placeholder;

	blocks.registerBlockType( 'klyna/form', {
		apiVersion: 2,
		title: __( 'Klyna Form', 'wp-forms' ),
		description: __( 'Embed a Klyna lead-gen form.', 'wp-forms' ),
		category: 'widgets',
		icon: 'feedback',
		attributes: {
			formId: { type: 'integer', default: 0 }
		},
		edit: function ( props ) {
			var formId = props.attributes.formId;

			var forms = useSelect( function ( select ) {
				var query = { per_page: 100, status: 'publish' };
				return select( 'core' ).getEntityRecords( 'postType', 'klyna_form', query );
			}, [] );

			var options = [ { label: __( 'Select a form…', 'wp-forms' ), value: 0 } ];
			if ( forms ) {
				forms.forEach( function ( form ) {
					options.push( {
						label: form.title && form.title.rendered ? form.title.rendered : '#' + form.id,
						value: form.id
					} );
				} );
			}

			return el(
				'div',
				useBlockProps(),
				el(
					Placeholder,
					{
						icon: 'feedback',
						label: __( 'Klyna Form', 'wp-forms' ),
						instructions: __( 'Choose which form to display on this page.', 'wp-forms' )
					},
					el( SelectControl, {
						value: formId,
						options: options,
						onChange: function ( value ) {
							props.setAttributes( { formId: parseInt( value, 10 ) || 0 } );
						}
					} )
				)
			);
		},
		save: function () {
			// Server-rendered.
			return null;
		}
	} );
} )(
	window.wp.blocks,
	window.wp.element,
	window.wp.blockEditor,
	window.wp.components,
	window.wp.data,
	window.wp.i18n
);
