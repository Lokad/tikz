// TeX wraps filenames across log lines; retain diagnostics without local paths.
export function sanitizeLabelledBorderLog(text){
  return text.replaceAll('\r\n','\n')
    .replace(/(?<![A-Za-z])[A-Za-z]:[\\/](?:[^\s(){}<>]|\n(?=[^\s(){}<>]))+/g,
      p=>'<local>/'+p.replaceAll('\n','').split(/[\\/]/).at(-1))
    .replace(/' TeX output \d{4}\.\d{2}\.\d{2}:\d{4}'/g,"' TeX output <timestamp>'");
}
