import { App, Menu, TFile, TAbstractFile, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { md5 } from "hash-wasm";


/* Settings */
/* ------------------------------------------------------------ */

export interface FileHashNameChangeSettings { prefix: string; }
export const DEFAULT_SETTINGS: FileHashNameChangeSettings = { prefix: "" }


/* Plugin */
/* ------------------------------------------------------------ */

export default class FileHashNameChangePlugin extends Plugin
{
	settings: FileHashNameChangeSettings;

	async onload()
	{
		await this.loadSettings();


		/* Rename version */
		/* ------------------------------------------------------------ */

		this.registerEvent(this.app.workspace.on("file-menu", (menu: Menu, file: TFile) =>
		{
			if(!is_file(file)) return;

			menu.addItem(item => item
				.setTitle(`Hash and rename this file`)
				.setIcon("pen-line")
				.onClick(async () =>
					{
						const OPTIONS = { prefix: this.settings.prefix, append: false };
						new FileHashingConfirmationModal(
							this.app, 1, OPTIONS,
							 () => hash_and_rename_file(this.app, file, OPTIONS)
						).open()
					}
				)
			)
		}))

		this.registerEvent(this.app.workspace.on("files-menu", (menu: Menu, abstract_files: TAbstractFile[]) =>
		{
			let files: TFile[] = abstract_files.filter(is_file) as TFile[];
			if(files.length < 1) return;

			menu.addItem(item => item
				.setTitle(`Hash and rename ${files.length} files`)
				.setIcon("pen-line")
				.onClick(async () =>
					{
						const OPTIONS = { prefix: this.settings.prefix, append: false };
						new FileHashingConfirmationModal(
							this.app, files.length, OPTIONS,
							() => Promise.all(files.map(file => hash_and_rename_file(this.app, file, OPTIONS)))
						).open()
					}
				)
			)
		}))


		/* Append version */
		/* ------------------------------------------------------------ */

		this.registerEvent(this.app.workspace.on("file-menu", (menu: Menu, file: TFile) =>
		{
			if(!is_file(file)) return;

			menu.addItem(item => item
				.setTitle(`Hash file and append it to filename`)
				.setIcon("pen-line")
				.onClick(async () =>
					{
						const OPTIONS = { prefix: this.settings.prefix, append: true };
						new FileHashingConfirmationModal(
							this.app, 1, OPTIONS,
							 () => hash_and_rename_file(this.app, file, OPTIONS)
						).open()
					}
				)
			)
		}))

		this.registerEvent(this.app.workspace.on("files-menu", (menu: Menu, abstract_files: TAbstractFile[]) =>
		{
			let files: TFile[] = abstract_files.filter(is_file) as TFile[];
			if(files.length < 1) return;

			menu.addItem(item => item
				.setTitle(`Hash ${files.length} files and append them to file name`)
				.setIcon("pen-line")
				.onClick(async () =>
					{
						const OPTIONS = { prefix: this.settings.prefix, append: true };
						new FileHashingConfirmationModal(
							this.app, files.length, OPTIONS,
							() => Promise.all(files.map(file => hash_and_rename_file(this.app, file, OPTIONS)))
						).open()
					}
				)
			)
		}))

		/* ------------------------------------------------------------ */

		this.addSettingTab(new FileHashNameChangeSettingTab(this.app, this));
	}

	onunload() { }
	async saveSettings() { await this.saveData(this.settings); }
	async loadSettings()
	{
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<FileHashNameChangeSettings>);
		this.settings.prefix = lint_prefix(this.settings.prefix);
	}
}


/* Views */
/* ------------------------------------------------------------ */

export class FileHashingConfirmationModal extends Modal
{
	constructor(app: App, files_to_hash: number, options: { prefix: string, append: boolean }, onConfirm: () => void)
	{
		super(app);
		if(files_to_hash < 1) return;

		let file_name = `${options.append ? "<filename>" : ""}${options.prefix}<hash>`
		let label = files_to_hash == 1
			? `You are going to change this file's name to '${file_name}', are you sure?`
			: `You are going to change ${files_to_hash} file names to '${file_name}', are you sure?`;

		this.setContent(label);
		new Setting(this.contentEl).addButton(btn => btn
			.setButtonText('Confirm')
			.onClick(() => { this.close(); onConfirm(); }));
	}
}

export class FileHashNameChangeSettingTab extends PluginSettingTab
{
	plugin: FileHashNameChangePlugin;
	constructor(app: App, plugin: FileHashNameChangePlugin) { super(app, plugin); this.plugin = plugin; }

	display(): void
	{
		this.containerEl.empty();
		new Setting(this.containerEl)
			.setName("Prefix")
			.setDesc("The string to prepend to the file name (no invalid path characters)")
			.addText(text => text
				.setPlaceholder("image-")
				.setValue(this.plugin.settings.prefix)
				.onChange(async (value) => {
					this.plugin.settings.prefix = lint_prefix(value);
					await this.plugin.saveSettings();
				}));
	}
}


/* Functions */
/* ------------------------------------------------------------ */

function lint_prefix(prefix: string): string
{
	return prefix
		.replace("\\", "")
		.replace("/",  "")
		.replace(":",  "")
		.replace("*",  "")
		.replace("?",  "")
		.replace("\"", "")
		.replace("<",  "")
		.replace(">",  "")
		.replace("|",  "");
}

function is_file(abstract_file: TAbstractFile): boolean
{
	return (abstract_file as TFile).stat !== undefined
}

/* return true on error */
async function hash_and_rename_file(app: App, file: TFile, options: { prefix: string, append: boolean }): Promise<boolean>
{
	let file_buffer: ArrayBuffer;
	let digest: string;

	if(!is_file(file))
	{
		console.error(`hash_and_rename_file("${file.basename}"): not a file!`);
		new Notice(`hash_and_rename_file("${file.basename}"): not a file!`, 0);
		return true;
	}

	try
	{
		file_buffer = await app.vault.readBinary(file);
	}
	catch(error)
	{
		console.error(`hash_and_rename_file("${file.basename}"): could not read file: ${error}`);
		new Notice(`Could not read '${file.basename}': ${error}`, 0);
		return true;
	}

	try
	{
		digest = await md5(new Uint8Array(file_buffer));
	}
	catch(error)
	{
		console.error(`hash_and_rename_file("${file.basename}"): could not hash file: ${error}`);
		new Notice(`Could not hash '${file.basename}': ${error}`, 0);
		return true;
	}

	if(digest.length != 32)
	{
		console.error(`hash_and_rename_file("${file.basename}"): invalid digest generated: "${digest}".length != 32`);
		new Notice(`invalid digest generated: "${digest}".length != 32`, 0);
		return true;
	}

	console.log(`hash_and_rename_file("${file.basename}"): digest ${digest}`);

	// @ts-ignore
	const digest_base64 = Uint8Array.fromHex(digest).toBase64({ alphabet: "base64url", omitPadding: true });
	const new_name = `${options.append ? file.basename : ""}${options.prefix}${digest_base64}.${file.extension}`;
	const parent_path = file.parent == null ? "" : (file.parent.parent == null ? "" : `/${file.parent.path}`)
	const new_path = `${parent_path}/${new_name}`;

	console.log(`hash_and_rename_file("${file.basename}"): renaming to '${new_path}'`);

	try
	{
		await app.fileManager.renameFile(file, new_path)
	}
	catch(error)
	{
		console.error(`hash_and_rename_file("${file.basename}"): could not rename file: ${error}`);
		new Notice(`Could not rename file '${file.basename}' to '${new_name}': ${error}`, 0);
		return true;
	}

	return false;
}
