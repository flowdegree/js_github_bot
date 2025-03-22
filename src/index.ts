import cron from 'node-cron';
import cronstrue from 'cronstrue';
import { Base64 } from 'js-base64';
import { Octokit } from "@octokit/rest";
import dotenv from 'dotenv';

dotenv.config();

/*				# ┌────────────── second (optional)
				# │ ┌──────────── minute
				# │ │ ┌────────── hour
				# │ │ │ ┌──────── day of month
				# │ │ │ │ ┌────── month
				# │ │ │ │ │ ┌──── day of week
				# │ │ │ │ │ │
				# │ │ │ │ │ │
				# * * * * * *				*/
const CRON_SCHEDULE = '0 0 */2 * * *';   // every two hours
const SLEEP_BETWEEN_ACTIONS = 2 * 60 * 1000; // minutes *  seconds *  milliseconds
const octokit = new Octokit({auth: process.env.GITHUB_TOKEN, userAgent: 'myApp v1.2.3',});
const constants = {	owner: "mo9a7i", repo: "time_now", branch: 'newest_time'};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

console.log(`running github bot every ${cronstrue.toString(CRON_SCHEDULE)}`)

// Add error handling for environment variables
if (!process.env.GITHUB_TOKEN) {
	console.error('GITHUB_TOKEN environment variable is not set');
	process.exit(1);
}

async function create_issue(data: any){
	console.log(`creating issue`)

	try {
		let result = await octokit.issues.create({
			...constants,
			title: data.title,
			body: data.body,
			labels: [],
		});
	
		const issue_id = result?.data?.number;
		console.log('issue id is: ', result?.data?.number)
		
		return issue_id;
	} 
	catch (error: any) {
		console.error('Error creating issue:', error.message);
		return null;
	}
}

async function commit_time(data: any){
	console.log(`committing the new time`)
	const MAX_RETRIES = 3;
	
	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			const path = `README.md`;

			let get_result: any = await octokit.repos.getContent({
				...constants,
				ref: 'newest_time',
				path,
			});
			
			const sha = get_result.data.sha;
			const content = Base64.decode(get_result.data.content);
			const new_content = content.replace(/\(\(.*\)\)/g, `(( ${data.date} ))`);
			const encoded = Base64.encode(new_content);

			const create_result = await octokit.repos.createOrUpdateFileContents({
				...constants,
				path,
				message: data.message,
				branch: data.branch_name,
				content: encoded,
				sha,
			});
			console.log('commit status', create_result.status);
			return create_result;
		} 
		catch (error: any) {
			console.error(`Attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);
			if (attempt === MAX_RETRIES) {
				console.error('All retry attempts failed');
				return null;
			}
			// Wait before retrying
			await sleep(5000 * attempt);
		}
	}
}

async function create_pull(data: any){
	try {	
		let result = await octokit.pulls.create({
			...constants,
			title: data.title,
			body: data.body,
			base: 'main',
			head: `${data.branch_name}`,
		});
		console.log(`created pull request # ${result.data.number}`)
		return result.data.number;

	} catch (error: any) {
		if (error.status === 422 && error.response.data.message === 'A pull request already exists for mo9a7i:newest_time.') {
			console.log('Pull request already exists for branch:', data.branch_name);
		} else {
			console.error(error?.response?.data?.errors);
		}
	}
}

async function create_review(data: any){
	console.log(`reviewing # ${data.pull_number}`)
	
	try {		
		let result = await octokit.pulls.createReview({
			...constants,
			pull_number: data.pull_number,
			body: data.body,
			event: 'COMMENT'
		})
		console.log('✅ Created Review')
		return result;	
	} 
	catch (error: any) {
		console.error(error?.response?.data?.errors);
	}
}

async function create_merge(pull_number: any){
	console.log(`merging # ${pull_number}`)
	try {	
		const result = await octokit.pulls.merge({
			...constants,
			pull_number: pull_number,            
		})
		return result;
	} 
	catch (error: any) {
		console.error(error?.response?.data?.errors);
	}
}

async function comment_on_issue(data: any){
	console.log(`commenting on issue # ${data.issue_id}`)
	try {
		const result = await octokit.issues.createComment({
			...constants,
			issue_number: data.issue_id,
			body: data.body,
		});

		return result;

	} catch (error) {
		
	}
}

async function close_issue(issue_id: any){
	console.log(`closing issue # ${issue_id}`)
	try {
		const result = await octokit.issues.update({
			...constants,
			issue_number: issue_id,
			state: 'closed',
		});
		return result;
	} catch (error) {
		
	}
}

async function run(){
	try {
		const date_now = new Date().toISOString();
		
		// Create Issue
		const issue_id = await create_issue({
			date: date_now, 
			title:`Check if time is accurate - ${date_now}`,
			body:`Please check if the time in \`time_now.txt\` 
				file is synchronized with world clocks ${date_now} and 
				if there are any other issues in the repo.`
		});
		
		await sleep(SLEEP_BETWEEN_ACTIONS);

		// update the time
		const create_result = await commit_time({
			date: date_now, 
			message: `Update time to "${date_now}"`, 
			branch_name: constants.branch
		});
		await sleep(SLEEP_BETWEEN_ACTIONS);
		
		// Pull request to main
		const pull_number = await create_pull({
			date:date_now, 
			branch_name: constants.branch,
			title: `Lets adjust to - ${date_now}`,
			body: `Time seems a little bit off 🤢.`
		});
		await sleep(SLEEP_BETWEEN_ACTIONS);
		
		// Review it
		await create_review({
			pull_number: pull_number,
			body: '👍 looks fine now, ready to merge'
		});
		await sleep(SLEEP_BETWEEN_ACTIONS);

		// Accept and merge
		await create_merge(pull_number);
		await sleep(SLEEP_BETWEEN_ACTIONS);

		// respond to issue and close
		await comment_on_issue({
			issue_id: issue_id, 
			body:`looks like it is 👌🏼.`
		});
		await sleep(SLEEP_BETWEEN_ACTIONS);

		await close_issue(issue_id);
	} 
	catch (error: any) {
		console.error('Error in run process:', error.message);
	}
}

cron.schedule(CRON_SCHEDULE, async () => {
	await run();
});

run();

// Add graceful shutdown
process.on('SIGTERM', () => {
	console.log('SIGTERM received, shutting down gracefully');
	// Clean up resources if needed
	process.exit(0);
});
