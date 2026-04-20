import {
	App, Menu, TFile, TAbstractFile, Modal, Notice,
	Plugin, PluginSettingTab, Setting, FileManager, DropdownComponent
} from 'obsidian';

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


		/* Rename hash */
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
							 () => void hash_and_rename_file(this.app, file, OPTIONS)
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
							() => void Promise.all(files.map(file => hash_and_rename_file(this.app, file, OPTIONS)))
						).open()
					}
				)
			)
		}))


		/* Append hash */
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
							 () => void hash_and_rename_file(this.app, file, OPTIONS)
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
							() => void Promise.all(files.map(file => hash_and_rename_file(this.app, file, OPTIONS)))
						).open()
					}
				)
			)
		}))


		/* Append property */
		/* ------------------------------------------------------------ */

		this.registerEvent(this.app.workspace.on("files-menu", (menu: Menu, abstract_files: TAbstractFile[]) =>
		{
			let files: TFile[] = abstract_files.filter(is_file) as TFile[];
			if(files.length < 1) return;

			menu.addItem(item => item
				.setTitle(`Append property to ${files.length} files`)
				.setIcon("pen-line")
				.onClick(() =>
					{
						const OPTIONS = { prefix: this.settings.prefix, append: true };
						new FilePropertyAppendingModal(
							this.app, files, OPTIONS,
							(property) => {
								const OPTIONS = { prefix: this.settings.prefix };
								void Promise.all(files.map(file => append_property_to_file(this.app, file, property, OPTIONS)))
							}
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

		this.setTitle("You sure?")

		let file_name_placeholder = `${options.append ? "<filename>" : ""}${options.prefix}<hash>`
		let label = files_to_hash == 1
			? `You are about to change this file's name to '${file_name_placeholder}'`
			: `You are about to change ${files_to_hash} file names to '${file_name_placeholder}'`;

		this.setContent(label);
		new Setting(this.contentEl).addButton(btn => btn
			.setButtonText('Confirm')
			.setWarning()
			.onClick(() => { this.close(); onConfirm(); }));
	}
}

export class FilePropertyAppendingModal extends Modal
{
	constructor(app: App, files: TFile[], options: { prefix: string }, onConfirm: (property: string) => void)
	{
		super(app);

		if(files.length < 1) return;
		this.setTitle("Choose property")

		void this.properties_update(this.app.fileManager, files).then(
			(properties: string[]) =>
			{
				if(properties.length < 1)
				{
					this.setContent(`No common property found among these files`);
					return
				}

				if(properties.length == 1)
				{
					let prop: string = properties[0] as string
					let file_name_placeholder = `<filename>${options.prefix}<${prop}>`
					this.setContent(`You are going to change ${files.length} file names to '${file_name_placeholder}' by appending '${prop}' property. Lists and moments are not supported`);
				}
				else
				{
					let file_name_placeholder = `<filename>${options.prefix}<property>`
					this.setContent(`You are going to change ${files.length} file names to '${file_name_placeholder}'. Lists and moments are not supported`);
				}

				let dropdown: DropdownComponent | null = null;
				let settings = new Setting(this.contentEl)

				if(properties.length > 1)
				{
					settings.addDropdown(dd => {
						dropdown = dd;
						properties.forEach(property => void dd.addOption(property, property))
					});
				}

				settings.addButton(btn => btn
					.setButtonText("Confirm")
					.setWarning()
					.onClick(() => {
						this.close();
						onConfirm(dropdown == null ? properties[0] as string : dropdown.getValue());
					})
				);
			}
		)
	}

	async properties_update(fileManager: FileManager, files: TFile[]): Promise<string[]>
	{
		let properties: string[] | null = null;
		if(files.length < 1) return [];

		for(let file of files)
		{
			let keys: string[] = [];

			await fileManager.processFrontMatter(file, frontmatter =>
			{
				const KEYS = Object.keys(frontmatter);
				if(properties == null) properties = KEYS;
				keys = KEYS;
			})

			if(keys.length < 1)
			{
				properties = [];
				break;
			}
			properties = array_intersect(properties as string[], keys);
		}

		if(properties == null)
		{
			console.error("sigh");
			return [];
		}

		return properties;
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

function array_intersect<T>(lhs: T[], rhs: T[]): T[]
{
	if(lhs == null || rhs == null) return [];
	return lhs.filter(val => rhs.includes(val));
}

function filename_get_fullpath(file: TFile, get_new_name: (basename: string) => string): string
{
	const new_name = `${get_new_name(file.basename)}.${file.extension}`;
	const parent_path = file.parent == null ? "" : (file.parent.parent == null ? "" : `/${file.parent.path}`)
	return `${parent_path}/${new_name}`;
}

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
	return abstract_file instanceof TFile
}

async function hash_file(app: App, file: TFile): Promise<string | null>
{
	let file_buffer: ArrayBuffer;
	let digest: string;

	try
	{
		file_buffer = await app.vault.readBinary(file);
	}
	catch(error)
	{
		console.error(`hash_file("${file.basename}"): could not read file: ${error}`);
		new Notice(`Could not read '${file.basename}': ${error}`, 0);
		return null;
	}

	try
	{
		digest = await md5(new Uint8Array(file_buffer));
	}
	catch(error)
	{
		console.error(`hash_file("${file.basename}"): could not hash file: ${error}`);
		new Notice(`Could not hash '${file.basename}': ${error}`, 0);
		return null;
	}

	if(digest.length != 32)
	{
		console.error(`hash_file("${file.basename}"): invalid digest generated: "${digest}".length != 32`);
		new Notice(`invalid digest generated: "${digest}".length != 32`, 0);
		return null;
	}

	return digest
}

async function file_rename(app: App, file: TFile, new_path: string): Promise<boolean>
{
	console.log(`file_rename("${file.basename}"): renaming to '${new_path}'`);

	try
	{
		await app.fileManager.renameFile(file, new_path)
	}
	catch(error)
	{
		console.error(`file_rename("${file.basename}"): could not rename file: ${error}`);
		new Notice(`Could not rename file '${file.basename}' to '${new_path}': ${error}`, 0);
		return true;
	}

	return false;
}

/* return true on error */
async function append_property_to_file(app: App, file: TFile, property: string, options: { prefix: string }): Promise<boolean>
{
	let error: boolean = false;

	await app.fileManager.processFrontMatter(file, (frontmatter: object) =>
		{
			let any_value = frontmatter[property as keyof(object)]
			let value: string = "";
			switch(typeof(any_value))
			{
				case "string":  value =   (any_value as string);   break;
				case "number":  value = `${any_value as number}`;  break;
				case "boolean": value = `${any_value as boolean}`; break;
				default:
					new Notice(`Invalid type (${typeof any_value}) for property ${property} in file ${file.name}`, 0)
					console.error(`append_property_to_file(${file.name}, ${property}): invalid property type '${typeof any_value})': ${any_value}`)
					error = true;
					return;
			}

			/* append to file */
			console.log(`Property: ${value}`);
			const NEW_PATH: string = filename_get_fullpath(file, (basename) => `${basename}${options.prefix}${value}`);
			void file_rename(app, file, NEW_PATH);
		}
	);

	return error;
}

/* return true on error */
async function hash_and_rename_file(app: App, file: TFile, options: { prefix: string, append: boolean }): Promise<boolean>
{
	let digest: string | null = await hash_file(app, file)
	if(digest == null) return true;

	// @ts-ignore
	const digest_base64: string = Uint8Array.fromHex(digest).toBase64({ alphabet: "base64url", omitPadding: true });

	const NEW_PATH: string = filename_get_fullpath(file, (basename) => `${options.append ? basename : ""}${options.prefix}${digest_base64}`);
	return await file_rename(app, file,  NEW_PATH)
}
