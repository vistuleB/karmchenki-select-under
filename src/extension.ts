import * as vscode from 'vscode';
import { AssertionError } from 'assert';
// import { EIDRM } from 'constants';

// hello -hello -hello -hello

enum SelectionsAdjustOrder {
	Forward,
	Backward,
	None
}

function is_alphanumeric(str: string): boolean {
	if (str.length === 0) { return false; }
	for (let i = 0; i < str.length; i++) {
		const code = str.charCodeAt(i);
		if (!(code > 47 && code < 58) && // numeric (0-9)
			!(code > 64 && code < 91) && // upper alpha (A-Z)
			!(code > 96 && code < 123) && // lower alpha (a-z)
			!(code === 45 || code === 95)) { // - and _
			return false;
		}
	}
	return true;
}

function find_end_or_beginning_of_word_you_tell_me(doc: vscode.TextDocument, pos: vscode.Position, delta: number): vscode.Position {
	if (delta !== 1 && delta !== -1) { throw new AssertionError(); }
	let prev_pos = pos;
	let next_pos = pos;
	while (true) {
		if (prev_pos.character === 0 && delta < 0) { break; }
		next_pos = prev_pos.translate({ characterDelta: delta, lineDelta: 0 });
		const word = doc.getText(new vscode.Range(prev_pos, next_pos));
		if (!is_alphanumeric(word)) { break; }
		prev_pos = next_pos;
	}
	if (delta < 0) {
		next_pos = prev_pos.translate({ characterDelta: 1, lineDelta: 0 });
		while (
			next_pos.isBeforeOrEqual(pos) &&
			doc.getText(new vscode.Range(prev_pos, next_pos)) === '-'
		) {
			prev_pos = next_pos;
			next_pos = next_pos.translate({ characterDelta: 1, lineDelta: 0 });
		}
	}
	return prev_pos;
}

function find_end_of_word(doc: vscode.TextDocument, pos: vscode.Position): vscode.Position {
	return find_end_or_beginning_of_word_you_tell_me(doc, pos, 1);
}

// word worder

function find_beginning_of_word(doc: vscode.TextDocument, pos: vscode.Position): vscode.Position {
	return find_end_or_beginning_of_word_you_tell_me(doc, pos, -1);
}

function extend_to_word(doc: vscode.TextDocument, pos: vscode.Position) {
	let beginning = find_beginning_of_word(doc, pos);
	let end = find_end_of_word(doc, pos);
	return new vscode.Range(beginning, end);
}

function is_whole_word(doc: vscode.TextDocument, sel: vscode.Selection): boolean {
	let beginning = find_beginning_of_word(doc, sel.start);
	if (beginning.line !== sel.start.line || beginning.character !== sel.start.character) { return false; }
	let end = find_end_of_word(doc, sel.end);
	return (end.line === sel.end.line && end.character === sel.end.character);
}

function all_selections_are_whole_words(editor: vscode.TextEditor) {
	return editor.selections.every(s => is_whole_word(editor.document, s));
}

function next_occurrence_of_starting_at(doc: vscode.TextDocument, word: string, startIndex: number, whole_word: boolean) {
	const text = doc.getText();
	while (true) {
		const index = text.indexOf(word, startIndex);
		if (index === -1) { break; }
		const start = doc.positionAt(index);
		const end = doc.positionAt(index + word.length);
		const selection = new vscode.Selection(start, end);
		if (whole_word && !is_whole_word(doc, selection)) {
			startIndex = index + 1;
			continue;
		}
		return selection;
	}
	return null;
}

function prev_occurrence_of_starting_at(doc: vscode.TextDocument, word: string, maxIndex: number, whole_word: boolean) {
	const text = doc.getText();
	while (true) {
		const index = text.lastIndexOf(word, maxIndex);
		if (index === -1) { break; }
		const start = doc.positionAt(index);
		const end = doc.positionAt(index + word.length);
		const selection = new vscode.Selection(start, end);
		if (whole_word && !is_whole_word(doc, selection)) {
			maxIndex = index - 1;
			continue;
		}
		return selection;
	}
	return null;
}

function sorted_selections(editor: vscode.TextEditor) {
	const to_return: vscode.Selection[] = [];
	let num = 0;
	for (const sel of editor.selections) {
		for (let i = num - 1; ; i--) {
			if (i < -1) { throw new AssertionError(); }
			else if (i === -1) { to_return.splice(0, 0, sel); break; }
			else if (to_return[i].start.isBefore(sel.start)) { to_return.splice(i + 1, 0, sel); break; }
		}
		num++;
	}
	if (to_return.length !== editor.selections.length) { throw new AssertionError(); }
	return to_return;
}

function adjusted_selection(selection: vscode.Selection, order: SelectionsAdjustOrder): vscode.Selection {
	if ((order === SelectionsAdjustOrder.Backward && selection.active.isAfter(selection.anchor)) ||
		(order === SelectionsAdjustOrder.Forward && selection.active.isBefore(selection.anchor))) {
		return new vscode.Selection(selection.active, selection.anchor);
	}
	return selection;
}

function adjust_selections(editor: vscode.TextEditor, order: SelectionsAdjustOrder): void {
	editor.selections = editor.selections.map(s => adjusted_selection(s, order));
}

function swap_last_selection_for(editor: vscode.TextEditor, new_last_selection: vscode.Selection) {
	const num_selections = editor.selections.length;
	if (num_selections === 0) { throw new AssertionError(); }
	const sorted = sorted_selections(editor);
	if (num_selections !== sorted.length) { throw new AssertionError(); }
	const old_last_selection = sorted[sorted.length - 1];
	editor.selections = editor.selections.map(s => (s === old_last_selection) ? new_last_selection : s);
}

function swap_first_selection_for(editor: vscode.TextEditor, new_first_selection: vscode.Selection) {
	const num_selections = editor.selections.length;
	if (num_selections === 0) { throw new AssertionError(); }
	const sorted = sorted_selections(editor);
	if (num_selections !== sorted.length) { throw new AssertionError(); }
	const old_first_selection = sorted[0];
	editor.selections = editor.selections.map(s => (s === old_first_selection) ? new_first_selection : s);
}

function add_to_selections(editor: vscode.TextEditor, new_selection: vscode.Selection) {
	const new_selections = [];
	for (const selection of editor.selections) { new_selections.push(selection); }
	new_selections.push(new_selection);
	editor.selections = new_selections;
}

function get_last_selection(editor: vscode.TextEditor) {
	const sorted = sorted_selections(editor);
	if (sorted.length === 0) { return null; }
	return sorted[sorted.length - 1];
}

function get_first_selection(editor: vscode.TextEditor) {
	const sorted = sorted_selections(editor);
	if (sorted.length === 0) { return null; }
	return sorted[0];
}

function extend_last_selection_to_word_if_empty(editor: vscode.TextEditor): boolean {
	const last_selection = get_last_selection(editor);
	if (last_selection === null || !last_selection.isEmpty) { return false; }
	const extended_range = extend_to_word(editor.document, last_selection.end);
	const new_selection = new vscode.Selection(extended_range.start, extended_range.end);
	swap_last_selection_for(editor, new_selection);
	return true;
}

function extend_first_selection_to_word_if_empty(editor: vscode.TextEditor): boolean {
	const first_selection = get_first_selection(editor);
	if (first_selection === null || !first_selection.isEmpty) { return false; }
	const extended_range = extend_to_word(editor.document, first_selection.end);
	const new_selection = new vscode.Selection(extended_range.start, extended_range.end);
	swap_first_selection_for(editor, new_selection);
	return true;
}

function next_occurrence_of_last_selection(editor: vscode.TextEditor, whole_word: boolean) {
	const last_selection = get_last_selection(editor);
	if (last_selection === null) { return null; }
	const word_under = editor.document.getText(last_selection);
	if (word_under.length === 0) { return null; }
	return next_occurrence_of_starting_at(
		editor.document,
		word_under,
		editor.document.offsetAt(last_selection.start) + 1,
		whole_word
	);
}

function prev_occurrence_of_first_selection(editor: vscode.TextEditor, whole_word: boolean) {
	const first_selection = get_first_selection(editor);
	if (first_selection === null) { return null; }
	const word_under = editor.document.getText(first_selection);
	if (word_under.length === 0) { return null; }
	return prev_occurrence_of_starting_at(
		editor.document,
		word_under,
		editor.document.offsetAt(first_selection.start) - 1,
		whole_word
	);
}

function is_in_sight(editor: vscode.TextEditor, selection: vscode.Selection) {
	for (const r of editor.visibleRanges) {
		if (r.contains(selection.start) && r.contains(selection.end)) { return true; }
	}
}

function bring_last_selection_into_sight(editor: vscode.TextEditor) {
	const last_selection = get_last_selection(editor);
	if (last_selection === null) { return; }
	if (is_in_sight(editor, last_selection)) { return; }
	editor.revealRange(last_selection.with(), 0);
}

function bring_first_selection_into_sight(editor: vscode.TextEditor) {
	const first_selection = get_first_selection(editor);
	if (first_selection === null) { return; }
	if (is_in_sight(editor, first_selection)) { return; }
	editor.revealRange(first_selection.with(), 0);
}

function selectWordUnderOrNextNoExtend(editor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
	const extended_the_last_selection = extend_last_selection_to_word_if_empty(editor);
	if (extended_the_last_selection) { return; }
	const whole_word = all_selections_are_whole_words(editor);
	const next_occurrence = next_occurrence_of_last_selection(editor, whole_word);
	if (next_occurrence === null) { return; }
	swap_last_selection_for(editor, next_occurrence);
	adjust_selections(editor, SelectionsAdjustOrder.Forward);
	bring_last_selection_into_sight(editor);
}

function selectWordUnderOrPrevNoExtend(editor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
	const extended_the_prev_selection = extend_first_selection_to_word_if_empty(editor);
	if (extended_the_prev_selection) {
		adjust_selections(editor, SelectionsAdjustOrder.Backward);
		return;
	}
	const whole_word = all_selections_are_whole_words(editor);
	const prev_occurrence = prev_occurrence_of_first_selection(editor, whole_word);
	if (prev_occurrence === null) { return; }
	swap_first_selection_for(editor, prev_occurrence);
	adjust_selections(editor, SelectionsAdjustOrder.Backward);
	bring_first_selection_into_sight(editor);
}

function selectWordUnderOrNextExtend(editor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
	extend_last_selection_to_word_if_empty(editor);
	const whole_word = all_selections_are_whole_words(editor);
	const next_occurrence = next_occurrence_of_last_selection(editor, whole_word);
	if (next_occurrence === null) { return; }
	add_to_selections(editor, next_occurrence);
	adjust_selections(editor, SelectionsAdjustOrder.Forward);
	bring_last_selection_into_sight(editor);
}

function selectWordUnderOrPrevExtend(editor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
	extend_first_selection_to_word_if_empty(editor);
	const whole_word = all_selections_are_whole_words(editor);
	const prev_occurrence = prev_occurrence_of_first_selection(editor, whole_word);
	if (prev_occurrence === null) { return; }
	add_to_selections(editor, prev_occurrence);
	adjust_selections(editor, SelectionsAdjustOrder.Backward);
	bring_first_selection_into_sight(editor);
}

function dropLastSelection(editor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
	const new_selections = [];
	const num_selections = editor.selections.length;
	if (num_selections <= 1) { return; }
	for (let i = 0; i < num_selections - 1; i++) { new_selections.push(editor.selections[i]); }
	editor.selections = new_selections;
	bring_last_selection_into_sight(editor);
}

function dropFirstSelection(editor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
	const new_selections = [];
	const num_selections = editor.selections.length;
	if (num_selections <= 1) { return; }
	for (let i = 1; i < num_selections; i++) { new_selections.push(editor.selections[i]); }
	editor.selections = new_selections;
	bring_first_selection_into_sight(editor);
}

interface VanillaCommand {
	name: string;
	func: (p1: vscode.TextEditor, p2: vscode.TextEditorEdit) => void;
}

function register_commands(extension_id: string, context: vscode.ExtensionContext, ze_list: VanillaCommand[]) {
	ze_list.forEach(z => vscode.commands.registerTextEditorCommand(extension_id + '.' + z.name, z.func));
}

export function activate(context: vscode.ExtensionContext) {
	register_commands(
		'karmchenki-select-under',
		context,
		[
			{ name: 'selectWordUnderOrNextNoExtend', func: selectWordUnderOrNextNoExtend },
			{ name: 'selectWordUnderOrPrevNoExtend', func: selectWordUnderOrPrevNoExtend },
			{ name: 'selectWordUnderOrNextExtend', func: selectWordUnderOrNextExtend },
			{ name: 'selectWordUnderOrPrevExtend', func: selectWordUnderOrPrevExtend },
			{ name: 'dropLastSelection', func: dropLastSelection },
			{ name: 'dropFirstSelection', func: dropFirstSelection }
		]
	);
}

export function deactivate() { }
