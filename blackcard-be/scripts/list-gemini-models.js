require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listAvailableModels() {
    console.log('='.repeat(80));
    console.log('Listing Available Gemini Models');
    console.log('='.repeat(80));
    
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        console.error('❌ ERROR: GEMINI_API_KEY is not set in .env file');
        process.exit(1);
    }
    
    console.log(`✓ API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}\n`);
    
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        
        // Try to fetch available models using the REST API directly
        console.log('📋 Fetching available models from Google API...\n');
        
        const https = require('https');
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        
        const data = await new Promise((resolve, reject) => {
            https.get(url, (res) => {
                let body = '';
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
        
        if (data.error) {
            console.error('❌ API Error:', data.error);
            console.error('   This might indicate:');
            console.error('   1. API key is invalid or expired');
            console.error('   2. Generative AI API is not enabled for this project');
            console.error('   3. API key does not have required permissions');
            process.exit(1);
        }
        
        if (data.models && data.models.length > 0) {
            console.log(`✅ Found ${data.models.length} available models:\n`);
            
            const modelsWithGenerateContent = data.models.filter(m => 
                m.supportedGenerationMethods && 
                m.supportedGenerationMethods.includes('generateContent')
            );
            
            console.log(`📝 Models supporting generateContent (${modelsWithGenerateContent.length}):`);
            modelsWithGenerateContent.forEach((model, index) => {
                console.log(`\n${index + 1}. ${model.name}`);
                console.log(`   Display Name: ${model.displayName || 'N/A'}`);
                console.log(`   Description: ${model.description || 'N/A'}`);
                console.log(`   Supported Methods: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`);
            });
            
            // Extract model names (remove 'models/' prefix)
            const modelNames = modelsWithGenerateContent.map(m => 
                m.name.replace('models/', '')
            );
            
            console.log('\n' + '='.repeat(80));
            console.log('Recommended model names to use:');
            console.log('='.repeat(80));
            modelNames.forEach(name => console.log(`  - ${name}`));
            
            // Test the first available model
            if (modelNames.length > 0) {
                console.log('\n🧪 Testing first available model:', modelNames[0]);
                try {
                    const model = genAI.getGenerativeModel({ model: modelNames[0] });
                    const result = await model.generateContent({
                        contents: [{ role: 'user', parts: [{ text: 'Say hello' }] }],
                    });
                    const response = await result.response;
                    const text = response.text();
                    console.log(`✅ SUCCESS! Model '${modelNames[0]}' is working`);
                    console.log(`   Response: ${text}`);
                } catch (testError) {
                    console.error(`❌ ERROR testing model:`, testError.message);
                }
            }
            
        } else {
            console.log('⚠️  No models found in the response');
            console.log('Full response:', JSON.stringify(data, null, 2));
        }
        
    } catch (error) {
        console.error('\n❌ FATAL ERROR:', error.message);
        console.error('Full error:', error);
        
        // If fetch is not available, try alternative approach
        if (error.message.includes('fetch')) {
            console.log('\n💡 Note: node-fetch might not be installed. Installing...');
            console.log('   Run: npm install node-fetch@2');
        }
        
        process.exit(1);
    }
}

listAvailableModels().catch(console.error);
