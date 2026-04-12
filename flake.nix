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
			{
				main-js = pkgs.stdenv.mkDerivation
				{
					name = "main-js";
					inherit version;
					src = ./.;

					nativeBuildInputs = [ pkgs.nodejs ];
					buildCommand = ''
npm install
npm run build
mv main.js $out/bin
'';
				};
			}
		);

		# nix run .#<name>
		apps = forAllSystems(system: {
			backend = {
				program = "${self.packages.${system}.backend}/bin/server";
				type = "app";
			};
		});

		# nix develop
		devShell = forAllSystems(
			system:
			let pkgs = allpkgs.${system}; in
			pkgs.mkShell
			{
				buildInputs = [ pkgs.nodejs ];
				shellHook = "zsh && exit";
			}
		);
	};
}
