import fs from "fs";
let path = require('path');
let {parse} = require('csv-parse');
let {stringify} = require('csv-stringify');

let help = false;

export const transpose = (inFilename: string, outFilename: string) => {

    for (let i = 0, len = process.argv.length; i < len; i++) {
        let arg = process.argv[i];
        if (arg === '-o' || arg === '--output') {
          i++;
          outFilename = process.argv[i];
        } else if (arg === '-i' || arg === '--input') {
          i++;
          inFilename = process.argv[i];
        } else if (arg === '-h' || arg === '--help') {
          help = true;
          let file = path.basename(__filename);
          console.log('Example with file: ' + file + ' -i in.csv -o out.csv');
          console.log('Example with pipe: cat in.csv | ' + file + ' > out.csv');
          process.exit(0);
        }
      }
      
      
      let text;
      if (inFilename) {
        text = fs.readFileSync(inFilename).toString();
      } else {
        text = fs.readFileSync(0).toString();
      }
      if (!text) {
        console.error('Error: input is empty!');
        process.exit(1);
      }
      
      let parser = parse({delimiter: ','});
      parser.write(text);
      parser.end();
      let rows: any[] = [];
      parser.on('readable', () => {
        let cols;
        while (cols = parser.read()) {
          rows.push(cols);
        }
      });
      parser.on('end', () => {
        let maxCol = 0;
        rows.forEach(cols => maxCol = Math.max(maxCol, cols.length));
      
        let results = [];
        for (let i = 0; i < maxCol; i++) {
          let result: any[] = [];
          rows.forEach(cols => result.push(cols[i]));
          results.push(result);
        }
      
        stringify(results, (err: any, output: any) => {
          if (err) {
            console.error(err);
            process.exit(1);
            return;
          }
          if (outFilename) {
            fs.writeFileSync(outFilename, output);
            console.error('saved to', outFilename);
          } else {
            process.stdout.write(output);
          }
        })
      });
}