export async function sleepForSecurity() {
	// slow down API for security to slow down brute-force
	await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 5000));
}