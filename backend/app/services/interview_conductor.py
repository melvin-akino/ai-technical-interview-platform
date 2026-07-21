from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from app.core.gemini import get_system_settings, pydantic_to_gemini_schema, generate_content

class IndividualQuestion(BaseModel):
    title: str = Field(description="The short title of this specific challenge (e.g. 'Question 1: Array Manipulation')")
    problem_statement: str = Field(description="Markdown description of the problem, including examples, input/output specifications, and constraints")
    starter_code: str = Field(description="Skeleton function template with basic arguments in the selected language")
    test_cases_code: str = Field(description="A block of test assertions or validation code in the selected language. It must be able to be appended directly to the candidate's code, execute it against 3-5 distinct test cases (including boundary edge cases), print clear descriptive test case failure strings to stderr and exit with status 1 on failure, or print 'All tests passed!' to stdout and exit with status 0 on success.")

class CodingProblem(BaseModel):
    challenge_title: str = Field(description="The general theme/title of this 3-question exam")
    questions: list[IndividualQuestion] = Field(description="List of exactly 3 progressive questions (index 0: Warm-up, index 1: Core algorithmic challenge, index 2: Code refactoring/optimization challenge)")

class InterviewerResponse(BaseModel):
    interviewer_message: str = Field(description="The verbal/written response from the AI interviewer, giving feedback, hints, or asking questions")
    should_end: bool = Field(description="True if the interview has reached a natural conclusion or the candidate has run out of time/given up")

# Definition of persona system prompts
PERSONA_PROMPTS = {
    "mentor": (
        "INTERVIEWER PERSONA: Encouraging Mentor\n"
        "- Maintain a very supportive, warm, and encouraging tone.\n"
        "- If the candidate is struggling or stuck, provide gentle, step-by-step guidance and small code hints.\n"
        "- Praise good code or sound logic when you see it to keep their confidence high."
    ),
    "tech_lead": (
        "INTERVIEWER PERSONA: Rigorous Tech Lead\n"
        "- Maintain a highly professional, strict, and rigorous tone.\n"
        "- Demands clean, production-grade code. Constantly ask about time and space complexities (Big O).\n"
        "- Focus heavily on edge cases, boundary testing, empty arrays, null values, and performance bottlenecks.\n"
        "- Do NOT provide direct code hints; instead, challenge their assumptions and ask them to dry-run or verify correctness themselves."
    ),
    "standard": (
        "INTERVIEWER PERSONA: Standard AI Interviewer\n"
        "- Maintain a balanced, objective, and polite professional tone.\n"
        "- Guide the candidate toward fixing bugs by raising conceptual questions or pointing out logic errors.\n"
        "- Only give conceptual hints when they request them."
    )
}

def generate_initial_problem(
    job_title: str, 
    job_description: str, 
    candidate_skills: str, 
    language: str, 
    company_id: int = None,
    persona: str = "standard"
) -> CodingProblem:
    
    selected_persona_prompt = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS["standard"])
    
    prompt = f"""
    You are an expert technical interviewer.
    Generate a coding exam consisting of exactly 3 progressive challenges suitable for a candidate applying for the role of '{job_title}'.
    The candidate has the following skills: {candidate_skills}.
    
    CRITICAL LANGUAGE REQUIREMENT:
    The candidate's selected coding language is '{language}'. You MUST generate all coding challenges and write all 'starter_code' and 'test_cases_code' blocks strictly in '{language}'. 
    Even if the job title ('{job_title}') or description mentions other tech stacks (such as React, Node, or TypeScript), the challenges must be adapted and implemented strictly in '{language}'. 
    For example, if the selected language is 'python', all challenges and starter templates must be pure Python.

    The 3 questions MUST follow this progression:
    - Index 0: A quick 'Warm-up' challenge (easy, basic logic).
    - Index 1: A 'Core Algorithmic' challenge (medium difficulty, aligning with the job description).
    - Index 2: A 'Code Refactoring / Optimization' challenge (refactoring a slow or verbose function to make it optimal).

    Each of the 3 challenges must:
    1. Align with the general requirements of the job description: {job_description}.
    2. Contain clear, concise markdown description with 2-3 examples (input, output, explanation) and constraints.
    3. Provide clean starter code template strictly in '{language}'.
    4. Provide the 'test_cases_code' strictly in '{language}' that can be appended directly to the candidate's code.
       - The test cases must validate the function provided in the 'starter_code'.
       - In Python: Use a try/except block. Run `assert your_func(...) == expected, "Test 1 Failed: ..."` multiple times. Print error message to sys.stderr and sys.exit(1) on AssertionError, or print "All tests passed!" and sys.exit(0) on success.
       - In JavaScript/TypeScript: Use a try/catch block. Check conditions and throw an Error if they fail. Print error.message to console.error and process.exit(1) on failure, or print "All tests passed!" and process.exit(0) on success.
       - In Go: Write a simple `main()` function that calls the candidate's function, prints a failure to os.Stderr and os.Exit(1) if any result is wrong, or prints "All tests passed!" and os.Exit(0).
       - In C++/C: Write a standard `int main()` that checks results, prints failures to std::cerr and returns 1 on failure, or prints "All tests passed!" and returns 0.
       - In PHP: Check conditions, print to stderr and exit(1) on failure, or print "All tests passed!" and exit(0) on success.
    """
    
    model_name, temp, prompt_modifier = get_system_settings(company_id=company_id)
    
    # Prepend persona prompt and modifier
    full_prompt = f"{selected_persona_prompt}\n\n"
    if prompt_modifier:
        full_prompt += f"System Persona & Recruiting Directives:\n{prompt_modifier}\n\n"
    full_prompt += prompt
    
    response = generate_content(company_id=company_id,
        model=model_name,
        contents=full_prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            # Inlined schema (not the raw Pydantic class): this model nests list[IndividualQuestion],
            # whose $defs/$ref this SDK version rejects. Parse the JSON back into the model below.
            response_schema=pydantic_to_gemini_schema(CodingProblem),
            temperature=temp
        )
    )
    return CodingProblem.model_validate_json(response.text)

def generate_interviewer_response(
    messages: list, 
    current_code: str, 
    job_title: str, 
    job_description: str, 
    language: str,
    company_id: int = None,
    persona: str = "standard"
) -> InterviewerResponse:
    """
    Evaluates the conversation history and the latest code state to generate the interviewer's next response or hint.
    """
    
    selected_persona_prompt = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS["standard"])
    
    # Format message history for the LLM context
    history_str = ""
    for msg in messages:
        sender_label = "Candidate" if msg.sender == "candidate" else "Interviewer"
        history_str += f"{sender_label}: {msg.message_text}\n"

    prompt = f"""
    You are a professional technical interviewer for a '{job_title}' role.
    Here is the job description: {job_description}
    Here is the selected language: {language}
    
    Review the conversation history and the candidate's current code state in the editor.
    
    Current Code in Editor:
    ```{language}
    {current_code}
    ```
    
    Conversation History:
    {history_str}
    
    Your goal is to guide the candidate.
    - If the candidate did not understand the question, clarify it.
    - If the candidate is stuck, ask clarifying questions or give a subtle hint (do NOT give away the complete code or solution!).
    - If they made a bug, guide them towards it by pointing out edge cases or asking them to dry-run a specific input.
    - If their solution is correct and optimal, or if they have given up / run out of things to say, set should_end to true and wrap up the session.
    """
    
    model_name, temp, prompt_modifier = get_system_settings(company_id=company_id)
    
    # Prepend persona prompt and modifier
    full_prompt = f"{selected_persona_prompt}\n\n"
    if prompt_modifier:
        full_prompt += f"System Persona & Recruiting Directives:\n{prompt_modifier}\n\n"
    full_prompt += prompt

    response = generate_content(company_id=company_id,
        model=model_name,
        contents=full_prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=InterviewerResponse,
            temperature=temp
        )
    )
    return response.parsed

class TranslatedIndividualQuestion(BaseModel):
    translated_title: str = Field(description="The short title of this specific challenge")
    translated_problem_statement: str = Field(description="The updated markdown coding problem description, adapted to reference concepts and syntax of the target language.")
    translated_starter_code: str = Field(description="The standard starter function / template signature in the target language.")
    translated_test_cases_code: str = Field(description="A block of language-specific assertion test code validating the function in the target language.")
    translated_current_code: str = Field(description="The translated version of the candidate's current written code into the target language. Keep function names and arguments matching the target language starter code, and translate their logic accurately.")

class TranslatedExam(BaseModel):
    questions: list[TranslatedIndividualQuestion] = Field(description="The list of translated questions")

def translate_problem_to_language(
    job_title: str,
    job_description: str,
    original_questions_json: str,
    target_language: str,
    company_id: int = None
) -> TranslatedExam:
    
    prompt = f"""
    You are an expert technical interviewer and language translator.
    A candidate undergoing a technical interview for the role '{job_title}' is switching their coding language to '{target_language}'.
    
    Job Description Context:
    {job_description}
    
    You are given a JSON array of questions, each containing its original title, problem description, starter code template, and the candidate's current written code.
    
    Original Questions List (JSON):
    {original_questions_json}
    
    Your task is to translate and adapt ALL questions in the list to the target language '{target_language}':
    For each question:
    1. Translate the title ('translated_title') and adapt the Markdown problem statement ('translated_problem_statement') to '{target_language}' (e.g. if the description mentions Python lists, update it to JavaScript arrays, Go slices, etc.).
    2. Provide a clean starter code template ('translated_starter_code') strictly in '{target_language}' (e.g., standard class/function template).
    3. Generate the 'translated_test_cases_code' strictly in '{target_language}' that can be appended directly to the code to validate it.
       - In Python: Use try/except, assertions, and sys.exit(0) / sys.exit(1).
       - In JavaScript/TypeScript: Use try/catch, throw Errors, and process.exit(0) / process.exit(1).
       - In Go: Write a test `main()` calling the candidate function and exiting via os.Exit(0) / os.Exit(1).
       - In C/C++: Write a standard `int main()` checking conditions and returning 0 (success) or 1 (failure).
       - In PHP: Check conditions, print to stderr and exit(1) on failure, or print "All tests passed!" and exit(0).
    4. Translate the candidate's current written code ('translated_current_code') into '{target_language}' as best as possible. If the candidate's code is empty or just the starter template, return the translated starter code template. Ensure the function names and variables align with the target language starter code structure.
    """
    
    model_name, temp, _ = get_system_settings(company_id=company_id)
    
    response = generate_content(company_id=company_id,
        model=model_name,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            # Inlined schema (not the raw Pydantic class): this model nests
            # list[TranslatedIndividualQuestion], whose $defs/$ref this SDK version rejects.
            response_schema=pydantic_to_gemini_schema(TranslatedExam),
            temperature=temp
        )
    )
    return TranslatedExam.model_validate_json(response.text)

