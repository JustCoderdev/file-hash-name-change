{
	description = "file-hash-name-change";
	inputs.nixpkgs.url = "nixpkgs/nixos-25.11";

	outputs = { self, nixpkgs }: let
		version = builtins.substring 0 8 self.lastModifiedDate;
		supportedSystems = [ "x86_64-linux" "x86_64-darwin" "aarch64-linux" "aarch64-darwin" ];
		forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
		allpkgs = forAllSystems (system: import nixpkgs { inherit system; });
	in
	{
		# nix build .#<name>
		packages = forAllSystems (system:
			let pkgs = allpkgs.${system}; in
			rec {
				default = main-js;
				main-js = pkgs.buildNpmPackage
				{
					pname = "main-js";
					inherit version;

					src = ./.;
					npmDepsHash = "sha256-PkAd9VGO5H5GNU1TVq1IM5Cik4f112PHQQeoMPy5c7E=";
					postInstall = ''
mkdir $out/bin
cp main.js manifest.json $out/bin
'';
				};
			}
		);

		# nix develop
		devShell = forAllSystems(
			system:
			let pkgs = allpkgs.${system}; in
			pkgs.mkShell
			{
				buildInputs = [ pkgs.nodejs ];
				shellHook = ''
npm install
zsh
exit
'';
			}
		);
	};
}
