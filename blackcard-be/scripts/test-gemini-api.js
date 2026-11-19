require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGeminiAPI() {
    console.log('='.repeat(80));
    console.log('Testing Gemini API Key');
    console.log('='.repeat(80));
    
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        console.error('❌ ERROR: GEMINI_API_KEY is not set in .env file');
        process.exit(1);
    }
    
    console.log(`✓ API Key found: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
    console.log(`✓ API Key length: ${apiKey.length} characters`);
    
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        
        // Try to list available models first
        console.log('\n📋 Attempting to list available models...');
        try {
            // Note: ListModels might not be available in all SDK versions
            // We'll try to use a model directly instead
            console.log('   (Skipping ListModels - will test with direct model call)');
        } catch (listError) {
            console.log('   ListModels not available, continuing with direct test...');
        }
        
        // Test with gemini-pro (most basic model)
        console.log('\n🧪 Testing with model: gemini-pro');
        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: 'Say hello in one word' }] }],
            });
            const response = await result.response;
            const text = response.text();
            console.log(`✅ SUCCESS! Model 'gemini-pro' is working`);
            console.log(`   Response: ${text}`);
        } catch (error) {
            console.error(`❌ ERROR with gemini-pro:`, error.message);
        }
        
        // Test with gemini-1.5-flash
        console.log('\n🧪 Testing with model: gemini-1.5-flash');
        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: 'Say hello in one word' }] }],
            });
            const response = await result.response;
            const text = response.text();
            console.log(`✅ SUCCESS! Model 'gemini-1.5-flash' is working`);
            console.log(`   Response: ${text}`);
        } catch (error) {
            console.error(`❌ ERROR with gemini-1.5-flash:`, error.message);
        }
        
        // Test with gemini-1.5-pro
        console.log('\n🧪 Testing with model: gemini-1.5-pro');
        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: 'Say hello in one word' }] }],
            });
            const response = await result.response;
            const text = response.text();
            console.log(`✅ SUCCESS! Model 'gemini-1.5-pro' is working`);
            console.log(`   Response: ${text}`);
        } catch (error) {
            console.error(`❌ ERROR with gemini-1.5-pro:`, error.message);
            console.error(`   Full error:`, error);
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('Test completed!');
        console.log('='.repeat(80));
        
    } catch (error) {
        console.error('\n❌ FATAL ERROR:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    }
}

testGeminiAPI().catch(console.error);
