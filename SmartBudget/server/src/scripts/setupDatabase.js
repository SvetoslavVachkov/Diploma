require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const setupDatabase = async () => {
  try {
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true
    };

    console.log('Connecting to MySQL server...');
    const connection = await mysql.createConnection(dbConfig);
    console.log('✓ Connected to MySQL server\n');

    const dbName = process.env.DB_NAME || 'smartbudget';
    
    console.log(`Creating database '${dbName}' if it doesn't exist...`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`✓ Database '${dbName}' ready\n`);

    await connection.query(`USE \`${dbName}\``);

    const schemaPath = path.join(__dirname, '../../../../database_schema.sql');
    
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }

    console.log('Reading schema file...');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    console.log('Schema loaded\n');

    console.log('Applying...');

    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let successCount = 0;
    let errorCount = 0;

    for (const statement of statements) {
      try {
        if (statement.toLowerCase().includes('create table') || 
            statement.toLowerCase().includes('insert into')) {
          await connection.query(statement);
          const tableMatch = statement.match(/CREATE TABLE\s+(\w+)/i);
          if (tableMatch) {
            console.log(`  Created table: ${tableMatch[1]}`);
            successCount++;
          } else if (statement.toLowerCase().includes('insert into')) {
            const insertMatch = statement.match(/INSERT INTO\s+(\w+)/i);
            if (insertMatch) {
              console.log(`  Inserted data into: ${insertMatch[1]}`);
              successCount++;
            }
          }
        }
      } catch (error) {
        if (error.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log(`  Table already exists (skipping)`);
        } else if (error.code === 'ER_DUP_ENTRY') {
          console.log(`  Duplicate entry (skipping)`);
        } else {
          console.error(`  Error: ${error.message}`);
          errorCount++;
        }
      }
    }

    console.log(`\n=== Setup Complete ===`);
    console.log(`Successful operations: ${successCount}`);
    if (errorCount > 0) {
      console.log(`Errors: ${errorCount}`);
    }
    console.log(`\nDatabase '${dbName}' is ready to use!`);

    await connection.end();
    process.exit(0);

  } catch (error) {
    console.error('\nDatabase setup failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

setupDatabase();

