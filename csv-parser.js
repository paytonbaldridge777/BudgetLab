/**
 * Minimal CSV Parser
 * Handles quoted fields, various line endings (CRLF, LF, CR), and escaped quotes
 */

const CSVParser = {
    /**
     * Parse CSV text into a 2D array
     * @param {string} text - Raw CSV text
     * @param {object} options - Parsing options
     * @returns {object} - Parse result with data and errors
     */
    parse: function(text, options = {}) {
        const config = {
            delimiter: options.delimiter || ',',
            skipEmptyLines: options.skipEmptyLines !== false,
            trimHeaders: options.trimHeaders !== false,
            header: options.header || false,
        };
        
        const data = [];
        const errors = [];
        
        // Normalize line endings to \n
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        let pos = 0;
        const len = text.length;
        
        while (pos < len) {
            const row = [];
            
            while (pos < len) {
                let cell = '';
                const char = text[pos];
                
                // Check if cell starts with quote
                if (char === '"') {
                    pos++; // Skip opening quote
                    
                    // Read until closing quote
                    while (pos < len) {
                        const c = text[pos];
                        
                        if (c === '"') {
                            // Check if it's an escaped quote (double quote)
                            if (pos + 1 < len && text[pos + 1] === '"') {
                                cell += '"';
                                pos += 2;
                            } else {
                                // End of quoted cell
                                pos++;
                                break;
                            }
                        } else {
                            cell += c;
                            pos++;
                        }
                    }
                    
                    // Skip any trailing whitespace or delimiter
                    while (pos < len && text[pos] !== config.delimiter && text[pos] !== '\n') {
                        pos++;
                    }
                } else {
                    // Unquoted cell - read until delimiter or newline
                    while (pos < len && text[pos] !== config.delimiter && text[pos] !== '\n') {
                        cell += text[pos];
                        pos++;
                    }
                    
                    // Trim unquoted cells
                    cell = cell.trim();
                }
                
                row.push(cell);
                
                // Check what terminated the cell
                if (pos < len && text[pos] === config.delimiter) {
                    pos++; // Skip delimiter
                } else {
                    // End of row
                    break;
                }
            }
            
            // Skip newline at end of row
            if (pos < len && text[pos] === '\n') {
                pos++;
            }
            
            // Add row if not empty or if we don't skip empty lines
            if (!config.skipEmptyLines || row.length > 0 && row.some(cell => cell !== '')) {
                data.push(row);
            }
        }
        
        return {
            data: data,
            errors: errors
        };
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.Papa = CSVParser;
}
