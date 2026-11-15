param(
  [Parameter(Mandatory=$true)][string]$Sdk,
  [Parameter(Mandatory=$true)][string]$Jdk,
  [string]$Origin='https://mantou-training-offline.vercel.app'
)
$ErrorActionPreference='Stop'
if($Origin -cnotmatch '^https://[a-z0-9.-]+(?::[1-9][0-9]{0,4})?$'){throw 'Use an exact HTTPS site origin, without a trailing slash'}
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$out=Join-Path $root 'test-output/one-tap-android'
$tools=Join-Path $Sdk 'build-tools/35.0.0'
$platform=Join-Path $Sdk 'platforms/android-36/android.jar'
$env:JAVA_HOME=$Jdk
$env:PATH=(Join-Path $Jdk 'bin')+[IO.Path]::PathSeparator+$env:PATH
New-Item -ItemType Directory -Force -Path $out,(Join-Path $out 'classes'),(Join-Path $out 'dex') | Out-Null
$buildOrigin=Join-Path $out 'BuildOrigin.java'
('package app.mantou.sleep.bridge; final class BuildOrigin { static final String URL = "'+$Origin+'"; }') |
  Set-Content -LiteralPath $buildOrigin -Encoding utf8NoBOM
function Run([string]$Exe,[string[]]$Arguments){
  & $Exe @Arguments
  if($LASTEXITCODE -ne 0){throw "Build failed with code $LASTEXITCODE"}
}
Run "$tools/aapt2.exe" @('link','-o',"$out/base.apk",'--manifest',"$PSScriptRoot/AndroidManifest.xml",'-I',$platform)
Run "$Jdk/bin/javac.exe" @('-encoding','UTF-8','--release','17','-classpath',$platform,'-d',"$out/classes",
  "$PSScriptRoot/MainActivity.java","$PSScriptRoot/Envelope.java",$buildOrigin)
Run "$Jdk/bin/jar.exe" @('cf',"$out/classes.jar",'-C',"$out/classes",'.')
Run "$tools/d8.bat" @('--lib',$platform,'--min-api','34','--output',"$out/dex","$out/classes.jar")
Copy-Item -LiteralPath "$out/base.apk" -Destination "$out/unsigned.apk" -Force
Run "$Jdk/bin/jar.exe" @('uf',"$out/unsigned.apk",'-C',"$out/dex",'classes.dex')
Run "$tools/zipalign.exe" @('-f','4',"$out/unsigned.apk","$out/aligned.apk")
if(!(Test-Path -LiteralPath "$out/local-test.keystore")){
  Run "$Jdk/bin/keytool.exe" @('-genkeypair','-keystore',"$out/local-test.keystore",'-storepass','android',
    '-keypass','android','-alias','local-test','-keyalg','RSA','-keysize','2048','-validity','3650','-dname','CN=Local Test')
}
Run "$tools/apksigner.bat" @('sign','--ks',"$out/local-test.keystore",'--ks-pass','pass:android',
  '--out',"$out/mantou-sleep-tool-local-test.apk","$out/aligned.apk")
Run "$tools/apksigner.bat" @('verify',"$out/mantou-sleep-tool-local-test.apk")
Get-FileHash -LiteralPath "$out/mantou-sleep-tool-local-test.apk" -Algorithm SHA256
