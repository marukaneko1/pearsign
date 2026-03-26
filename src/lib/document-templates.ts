/**
 * Professional Legal Document Templates
 *
 * Comprehensive templates for legal documents with proper structure,
 * clauses, and formatting based on industry standards.
 */

export interface DocumentTemplateParams {
  answers: Record<string, string>;
  today: string;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  generate: (params: DocumentTemplateParams) => string;
}

/**
 * Generate Non-Disclosure Agreement
 */
function generateNDA({ answers, today }: DocumentTemplateParams): string {
  const disclosingParty = answers["What is the name of the disclosing party (the one sharing confidential information)?"] || "[DISCLOSING PARTY NAME]";
  const receivingParty = answers["What is the name of the receiving party?"] || "[RECEIVING PARTY NAME]";
  const confidentialInfo = answers["What type of confidential information will be shared?"] || "technical data, trade secrets, business strategies, financial information, customer lists, product plans, designs, contracts, and marketing plans";
  const duration = answers["How long should the confidentiality obligation last?"] || "two (2) years";

  return `NON-DISCLOSURE AGREEMENT

Effective Date: ${today}

This Non-Disclosure Agreement (the "Agreement") is entered into as of the Effective Date by and between:

═══════════════════════════════════════════════════════════════════════════════

                                    PARTIES

═══════════════════════════════════════════════════════════════════════════════

DISCLOSING PARTY:
Name: ${disclosingParty}
(hereinafter referred to as the "Disclosing Party")

RECEIVING PARTY:
Name: ${receivingParty}
(hereinafter referred to as the "Receiving Party")

The Disclosing Party and the Receiving Party may be referred to individually as a "Party" and collectively as the "Parties."

═══════════════════════════════════════════════════════════════════════════════

                                   RECITALS

═══════════════════════════════════════════════════════════════════════════════

WHEREAS, the Disclosing Party possesses certain confidential and proprietary information relating to its business operations, technology, products, services, and other matters;

WHEREAS, the Receiving Party desires to receive disclosure of such confidential information for the purpose of evaluating a potential business relationship, transaction, or collaboration between the Parties;

WHEREAS, the Disclosing Party is willing to disclose such confidential information to the Receiving Party, subject to the terms and conditions set forth herein;

NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:

═══════════════════════════════════════════════════════════════════════════════

              ARTICLE 1 - DEFINITION OF CONFIDENTIAL INFORMATION

═══════════════════════════════════════════════════════════════════════════════

1.1 "Confidential Information" means any and all information or data, in any form or medium, whether tangible or intangible, disclosed by the Disclosing Party to the Receiving Party, including but not limited to:

    (a) ${confidentialInfo};

    (b) Business information, including but not limited to: business plans, marketing strategies, pricing information, financial data, projections, customer and supplier lists, sales data, and operational information;

    (c) Technical information, including but not limited to: inventions, discoveries, improvements, processes, techniques, formulas, algorithms, software, source code, object code, designs, drawings, specifications, and research and development information;

    (d) Any other information that is designated as confidential, proprietary, or the like, whether orally, in writing, or by any other means of communication;

    (e) Any information that a reasonable person would understand to be confidential given the nature of the information and circumstances of disclosure.

1.2 Confidential Information shall include information disclosed in any manner, including but not limited to: written documents, electronic communications, oral disclosures, visual demonstrations, and samples or prototypes.

1.3 Confidential Information does NOT include information that:

    (a) Is or becomes publicly available through no fault, act, or omission of the Receiving Party;

    (b) Was rightfully in the Receiving Party's possession prior to disclosure by the Disclosing Party, as evidenced by written records;

    (c) Is rightfully obtained by the Receiving Party from a third party without restriction and without breach of any confidentiality obligation;

    (d) Is independently developed by the Receiving Party without use of or reference to the Confidential Information, as evidenced by written records;

    (e) Is required to be disclosed by law, regulation, or court order, provided that the Receiving Party gives the Disclosing Party prompt written notice of such requirement and cooperates with the Disclosing Party's efforts to obtain a protective order or other appropriate remedy.

═══════════════════════════════════════════════════════════════════════════════

                    ARTICLE 2 - OBLIGATIONS OF RECEIVING PARTY

═══════════════════════════════════════════════════════════════════════════════

2.1 NON-DISCLOSURE: The Receiving Party agrees to hold all Confidential Information in strict confidence and shall not disclose any Confidential Information to any third party without the prior written consent of the Disclosing Party.

2.2 LIMITED USE: The Receiving Party shall use the Confidential Information solely for the purpose of evaluating and engaging in business discussions, negotiations, or transactions with the Disclosing Party (the "Permitted Purpose"). The Receiving Party shall not use the Confidential Information for any other purpose whatsoever.

2.3 STANDARD OF CARE: The Receiving Party shall protect the Confidential Information using the same degree of care that it uses to protect its own confidential information of like nature, but in no event less than a reasonable degree of care.

2.4 LIMITED ACCESS: The Receiving Party shall limit access to Confidential Information to those of its employees, agents, representatives, contractors, and advisors (collectively, "Representatives") who:

    (a) Have a genuine need to know the Confidential Information for the Permitted Purpose;

    (b) Are informed of the confidential nature of the Confidential Information; and

    (c) Are bound by confidentiality obligations at least as protective as those contained in this Agreement.

2.5 RESPONSIBILITY FOR REPRESENTATIVES: The Receiving Party shall be responsible for any breach of this Agreement by its Representatives.

2.6 NO COPIES: The Receiving Party shall not copy, reproduce, or duplicate any Confidential Information except as reasonably necessary for the Permitted Purpose, and all such copies shall be subject to the terms of this Agreement.

2.7 NO REVERSE ENGINEERING: The Receiving Party shall not reverse engineer, disassemble, or decompile any Confidential Information or any products or prototypes provided by the Disclosing Party.

═══════════════════════════════════════════════════════════════════════════════

                          ARTICLE 3 - TERM AND DURATION

═══════════════════════════════════════════════════════════════════════════════

3.1 TERM: This Agreement shall remain in effect for ${duration} from the Effective Date, unless earlier terminated in accordance with Section 3.3.

3.2 SURVIVAL: The confidentiality obligations set forth in this Agreement shall survive the termination or expiration of this Agreement and shall continue for a period of five (5) years following such termination or expiration, or for such longer period as may be required to protect trade secrets under applicable law.

3.3 TERMINATION: Either Party may terminate this Agreement at any time by providing thirty (30) days' written notice to the other Party. Termination shall not affect any rights or obligations that have accrued prior to the effective date of termination.

═══════════════════════════════════════════════════════════════════════════════

                  ARTICLE 4 - RETURN OR DESTRUCTION OF INFORMATION

═══════════════════════════════════════════════════════════════════════════════

4.1 Upon the termination or expiration of this Agreement, or upon written request by the Disclosing Party at any time, the Receiving Party shall promptly:

    (a) Return to the Disclosing Party all Confidential Information and any copies, reproductions, or derivatives thereof; or

    (b) Destroy all Confidential Information and any copies, reproductions, or derivatives thereof, and certify such destruction in writing to the Disclosing Party.

4.2 Notwithstanding the foregoing, the Receiving Party may retain one (1) archival copy of Confidential Information solely for the purpose of determining its ongoing obligations under this Agreement, subject to the confidentiality obligations herein.

4.3 Any Confidential Information retained in accordance with Section 4.2 shall continue to be subject to the terms of this Agreement.

═══════════════════════════════════════════════════════════════════════════════

                        ARTICLE 5 - NO LICENSE OR RIGHTS GRANTED

═══════════════════════════════════════════════════════════════════════════════

5.1 Nothing in this Agreement shall be construed as granting any rights, by license or otherwise, to any Confidential Information, or to any patent, copyright, trademark, trade secret, or other intellectual property right of the Disclosing Party.

5.2 The Disclosing Party retains all right, title, and interest in and to its Confidential Information, including all intellectual property rights therein.

5.3 This Agreement does not obligate either Party to enter into any further agreement or transaction with the other Party.

═══════════════════════════════════════════════════════════════════════════════

                              ARTICLE 6 - NO WARRANTY

═══════════════════════════════════════════════════════════════════════════════

6.1 ALL CONFIDENTIAL INFORMATION IS PROVIDED "AS IS." THE DISCLOSING PARTY MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED, REGARDING THE ACCURACY, COMPLETENESS, PERFORMANCE, MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT OF THE CONFIDENTIAL INFORMATION.

6.2 The Disclosing Party shall not be liable for any damages arising from the Receiving Party's use of or reliance on the Confidential Information.

═══════════════════════════════════════════════════════════════════════════════

                              ARTICLE 7 - REMEDIES

═══════════════════════════════════════════════════════════════════════════════

7.1 The Receiving Party acknowledges that any unauthorized disclosure or use of Confidential Information may cause irreparable harm to the Disclosing Party for which monetary damages may be inadequate.

7.2 In the event of any actual or threatened breach of this Agreement, the Disclosing Party shall be entitled to seek equitable relief, including but not limited to temporary restraining orders, preliminary injunctions, and permanent injunctions, without the necessity of proving actual damages or posting any bond or other security.

7.3 The remedies provided herein shall be cumulative and in addition to any other remedies available to the Disclosing Party at law or in equity.

═══════════════════════════════════════════════════════════════════════════════

                          ARTICLE 8 - GENERAL PROVISIONS

═══════════════════════════════════════════════════════════════════════════════

8.1 GOVERNING LAW: This Agreement shall be governed by and construed in accordance with the laws of the State in which the Disclosing Party is headquartered, without regard to its conflict of laws principles.

8.2 ENTIRE AGREEMENT: This Agreement constitutes the entire agreement between the Parties concerning the subject matter hereof and supersedes all prior and contemporaneous agreements, negotiations, representations, warranties, and understandings, whether written or oral.

8.3 AMENDMENTS: This Agreement may not be amended, modified, or supplemented except by a written instrument signed by authorized representatives of both Parties.

8.4 SEVERABILITY: If any provision of this Agreement is held to be invalid, illegal, or unenforceable, the validity, legality, and enforceability of the remaining provisions shall not be affected or impaired thereby.

8.5 WAIVER: The failure of either Party to enforce any right or provision of this Agreement shall not constitute a waiver of such right or provision or any other right or provision of this Agreement.

8.6 ASSIGNMENT: Neither Party may assign or transfer this Agreement or any rights or obligations hereunder without the prior written consent of the other Party, except that either Party may assign this Agreement to an affiliate or in connection with a merger, acquisition, or sale of all or substantially all of its assets.

8.7 NOTICES: All notices, requests, demands, and other communications under this Agreement shall be in writing and shall be deemed to have been duly given when delivered personally, sent by confirmed email, or sent by certified or registered mail, postage prepaid, to the addresses set forth above.

8.8 COUNTERPARTS: This Agreement may be executed in counterparts, each of which shall be deemed an original and all of which together shall constitute one and the same instrument.

═══════════════════════════════════════════════════════════════════════════════

                                  SIGNATURES

═══════════════════════════════════════════════════════════════════════════════

IN WITNESS WHEREOF, the Parties have executed this Non-Disclosure Agreement as of the Effective Date.


DISCLOSING PARTY:

Signature: _________________________________________

Printed Name: ${disclosingParty}

Title: _________________________________________

Date: _________________________________________


RECEIVING PARTY:

Signature: _________________________________________

Printed Name: ${receivingParty}

Title: _________________________________________

Date: _________________________________________


═══════════════════════════════════════════════════════════════════════════════
This document was generated by PearSign Document Center.
Please consult with a qualified legal professional before use.
═══════════════════════════════════════════════════════════════════════════════`;
}

/**
 * Generate Service Agreement
 */
function generateServiceAgreement({ answers, today }: DocumentTemplateParams): string {
  const provider = answers["What is the name of the service provider?"] || "[SERVICE PROVIDER NAME]";
  const client = answers["What is the name of the client?"] || "[CLIENT NAME]";
  const services = answers["What services will be provided?"] || "[Description of services to be provided]";
  const payment = answers["What is the payment amount and schedule?"] || "[Payment terms and schedule]";

  return `SERVICE AGREEMENT

Effective Date: ${today}

This Service Agreement (the "Agreement") is entered into as of the Effective Date by and between:

═══════════════════════════════════════════════════════════════════════════════

                                    PARTIES

═══════════════════════════════════════════════════════════════════════════════

SERVICE PROVIDER:
Name: ${provider}
(hereinafter referred to as the "Provider" or "Service Provider")

CLIENT:
Name: ${client}
(hereinafter referred to as the "Client")

The Provider and Client may be referred to individually as a "Party" and collectively as the "Parties."

═══════════════════════════════════════════════════════════════════════════════

                                   RECITALS

═══════════════════════════════════════════════════════════════════════════════

WHEREAS, the Provider is engaged in the business of providing professional services and possesses the skills, expertise, and resources necessary to perform such services;

WHEREAS, the Client desires to engage the Provider to perform certain services as more particularly described herein;

WHEREAS, the Provider is willing to perform such services subject to the terms and conditions set forth in this Agreement;

NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the Parties agree as follows:

═══════════════════════════════════════════════════════════════════════════════

                         ARTICLE 1 - SCOPE OF SERVICES

═══════════════════════════════════════════════════════════════════════════════

1.1 SERVICES: The Provider agrees to provide the following services to the Client (the "Services"):

${services}

1.2 PERFORMANCE STANDARDS: The Provider shall perform all Services in a professional, workmanlike manner consistent with industry standards and best practices. The Provider shall use qualified personnel and appropriate methods and materials.

1.3 DELIVERABLES: The Provider shall deliver all work product, reports, documents, and other deliverables as specified in this Agreement or as mutually agreed upon by the Parties in writing.

1.4 CLIENT COOPERATION: The Client agrees to provide the Provider with timely access to information, materials, personnel, and resources reasonably necessary for the Provider to perform the Services.

1.5 CHANGES TO SCOPE: Any changes to the scope of Services must be agreed upon in writing by both Parties. Such changes may result in adjustments to the project timeline, deliverables, and compensation.

═══════════════════════════════════════════════════════════════════════════════

                     ARTICLE 2 - COMPENSATION AND PAYMENT

═══════════════════════════════════════════════════════════════════════════════

2.1 COMPENSATION: In consideration for the Services, the Client agrees to pay the Provider as follows:

${payment}

2.2 INVOICING: The Provider shall submit invoices to the Client in accordance with the payment schedule set forth above. Each invoice shall include a detailed description of Services rendered during the applicable period.

2.3 PAYMENT TERMS: Unless otherwise specified, payment is due within thirty (30) days of the invoice date. Late payments shall bear interest at a rate of one and one-half percent (1.5%) per month, or the maximum rate permitted by law, whichever is less.

2.4 EXPENSES: The Client shall reimburse the Provider for all reasonable, pre-approved, out-of-pocket expenses incurred by the Provider in connection with the performance of the Services, upon submission of appropriate documentation.

2.5 TAXES: The Provider shall be solely responsible for all applicable taxes arising from compensation received under this Agreement, including but not limited to income taxes, self-employment taxes, and similar assessments.

═══════════════════════════════════════════════════════════════════════════════

                       ARTICLE 3 - TERM AND TERMINATION

═══════════════════════════════════════════════════════════════════════════════

3.1 TERM: This Agreement shall commence on the Effective Date and shall continue until the Services are completed, unless earlier terminated in accordance with this Article.

3.2 TERMINATION FOR CONVENIENCE: Either Party may terminate this Agreement at any time for any reason by providing thirty (30) days' prior written notice to the other Party.

3.3 TERMINATION FOR CAUSE: Either Party may terminate this Agreement immediately upon written notice if the other Party:

    (a) Commits a material breach of this Agreement that remains uncured for fifteen (15) days after written notice thereof;

    (b) Becomes insolvent, files for bankruptcy, or ceases to conduct business operations;

    (c) Engages in conduct that materially damages the other Party's reputation or business interests.

3.4 EFFECT OF TERMINATION: Upon termination of this Agreement:

    (a) The Client shall pay the Provider for all Services rendered and expenses incurred up to the effective date of termination;

    (b) Each Party shall return to the other Party all property, materials, and Confidential Information belonging to such Party;

    (c) Provisions of this Agreement that by their nature should survive termination shall remain in full force and effect.

═══════════════════════════════════════════════════════════════════════════════

                     ARTICLE 4 - INDEPENDENT CONTRACTOR

═══════════════════════════════════════════════════════════════════════════════

4.1 INDEPENDENT CONTRACTOR STATUS: The Provider is an independent contractor and nothing in this Agreement shall be construed to create an employment, partnership, joint venture, or agency relationship between the Parties.

4.2 NO EMPLOYEE BENEFITS: The Provider shall not be entitled to any employee benefits, including but not limited to health insurance, retirement benefits, vacation, sick leave, or workers' compensation.

4.3 TAX RESPONSIBILITY: The Provider shall be solely responsible for the payment of all taxes, including but not limited to income taxes, self-employment taxes, and any other taxes or assessments arising from compensation received under this Agreement.

4.4 NO AUTHORITY TO BIND: The Provider shall have no authority to bind the Client or to enter into any contracts or agreements on behalf of the Client without the Client's prior written authorization.

═══════════════════════════════════════════════════════════════════════════════

                       ARTICLE 5 - INTELLECTUAL PROPERTY

═══════════════════════════════════════════════════════════════════════════════

5.1 WORK PRODUCT: All work product, deliverables, materials, and other tangible items created by the Provider in the course of performing the Services (the "Work Product") shall be the sole and exclusive property of the Client upon full payment.

5.2 ASSIGNMENT: The Provider hereby assigns to the Client all right, title, and interest in and to the Work Product, including all copyrights, patents, trademarks, trade secrets, and other intellectual property rights therein.

5.3 PRE-EXISTING MATERIALS: The Provider retains all right, title, and interest in and to any pre-existing materials, tools, methodologies, or intellectual property owned by the Provider prior to this Agreement or developed independently of this Agreement (the "Provider Materials"). The Provider grants the Client a perpetual, non-exclusive, royalty-free license to use any Provider Materials incorporated into the Work Product.

5.4 MORAL RIGHTS: To the extent permitted by law, the Provider waives any moral rights in the Work Product.

═══════════════════════════════════════════════════════════════════════════════

                          ARTICLE 6 - CONFIDENTIALITY

═══════════════════════════════════════════════════════════════════════════════

6.1 CONFIDENTIAL INFORMATION: Each Party acknowledges that it may receive confidential and proprietary information of the other Party in connection with this Agreement ("Confidential Information").

6.2 NON-DISCLOSURE: Each Party agrees to hold all Confidential Information in strict confidence and shall not disclose any Confidential Information to any third party without the prior written consent of the disclosing Party.

6.3 LIMITED USE: Each Party shall use Confidential Information only for the purposes of this Agreement and shall not use such information for any other purpose whatsoever.

6.4 EXCEPTIONS: Confidential Information does not include information that: (a) is or becomes publicly available through no fault of the receiving Party; (b) was rightfully in the receiving Party's possession prior to disclosure; (c) is independently developed without use of Confidential Information; or (d) is required to be disclosed by law.

6.5 SURVIVAL: The confidentiality obligations set forth in this Article shall survive the termination or expiration of this Agreement for a period of three (3) years.

═══════════════════════════════════════════════════════════════════════════════

                   ARTICLE 7 - REPRESENTATIONS AND WARRANTIES

═══════════════════════════════════════════════════════════════════════════════

7.1 PROVIDER WARRANTIES: The Provider represents and warrants that:

    (a) It has the full right, power, and authority to enter into this Agreement and to perform its obligations hereunder;

    (b) The Services will be performed in a professional and workmanlike manner consistent with industry standards;

    (c) The Work Product will be original and will not infringe upon any third-party intellectual property rights;

    (d) It will comply with all applicable laws, rules, and regulations in the performance of the Services.

7.2 CLIENT WARRANTIES: The Client represents and warrants that:

    (a) It has the full right, power, and authority to enter into this Agreement and to perform its obligations hereunder;

    (b) It will provide timely access to information, materials, and resources necessary for the Provider to perform the Services;

    (c) It will make timely payments as required by this Agreement.

═══════════════════════════════════════════════════════════════════════════════

                      ARTICLE 8 - LIMITATION OF LIABILITY

═══════════════════════════════════════════════════════════════════════════════

8.1 EXCLUSION OF DAMAGES: IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES ARISING OUT OF OR RELATED TO THIS AGREEMENT, REGARDLESS OF WHETHER SUCH DAMAGES WERE FORESEEABLE OR WHETHER EITHER PARTY WAS ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

8.2 LIABILITY CAP: THE TOTAL CUMULATIVE LIABILITY OF EITHER PARTY ARISING OUT OF OR RELATED TO THIS AGREEMENT SHALL NOT EXCEED THE TOTAL AMOUNT PAID OR PAYABLE BY THE CLIENT TO THE PROVIDER UNDER THIS AGREEMENT.

8.3 EXCEPTIONS: The limitations set forth in this Article shall not apply to: (a) breaches of confidentiality obligations; (b) intellectual property infringement; or (c) gross negligence or willful misconduct.

═══════════════════════════════════════════════════════════════════════════════

                          ARTICLE 9 - INDEMNIFICATION

═══════════════════════════════════════════════════════════════════════════════

9.1 PROVIDER INDEMNIFICATION: The Provider shall indemnify, defend, and hold harmless the Client and its officers, directors, employees, and agents from and against any and all claims, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or related to: (a) the Provider's negligence or willful misconduct; (b) any breach of this Agreement by the Provider; or (c) any claim that the Work Product infringes upon third-party intellectual property rights.

9.2 CLIENT INDEMNIFICATION: The Client shall indemnify, defend, and hold harmless the Provider and its officers, directors, employees, and agents from and against any and all claims, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or related to: (a) the Client's negligence or willful misconduct; or (b) any breach of this Agreement by the Client.

═══════════════════════════════════════════════════════════════════════════════

                        ARTICLE 10 - DISPUTE RESOLUTION

═══════════════════════════════════════════════════════════════════════════════

10.1 NEGOTIATION: The Parties shall first attempt to resolve any dispute arising out of or relating to this Agreement through good-faith negotiation between representatives of the Parties.

10.2 MEDIATION: If negotiation fails to resolve the dispute within thirty (30) days, the Parties shall submit the dispute to non-binding mediation before a mutually agreed-upon mediator.

10.3 ARBITRATION: If mediation fails to resolve the dispute, the dispute shall be resolved by binding arbitration in accordance with the rules of the American Arbitration Association. The arbitration shall take place in a mutually agreed-upon location.

10.4 GOVERNING LAW: This Agreement shall be governed by and construed in accordance with the laws of the applicable jurisdiction, without regard to its conflict of laws principles.

═══════════════════════════════════════════════════════════════════════════════

                        ARTICLE 11 - GENERAL PROVISIONS

═══════════════════════════════════════════════════════════════════════════════

11.1 ENTIRE AGREEMENT: This Agreement constitutes the entire agreement between the Parties concerning the subject matter hereof and supersedes all prior agreements, negotiations, and understandings.

11.2 AMENDMENTS: This Agreement may not be amended or modified except by a written instrument signed by both Parties.

11.3 SEVERABILITY: If any provision of this Agreement is held to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.

11.4 WAIVER: The failure of either Party to enforce any provision of this Agreement shall not constitute a waiver of such provision or any other provision.

11.5 ASSIGNMENT: Neither Party may assign this Agreement without the prior written consent of the other Party.

11.6 NOTICES: All notices shall be in writing and delivered to the addresses set forth above.

11.7 FORCE MAJEURE: Neither Party shall be liable for delays or failures in performance resulting from events beyond the reasonable control of such Party.

11.8 COUNTERPARTS: This Agreement may be executed in counterparts, each of which shall be deemed an original.

═══════════════════════════════════════════════════════════════════════════════

                                  SIGNATURES

═══════════════════════════════════════════════════════════════════════════════

IN WITNESS WHEREOF, the Parties have executed this Service Agreement as of the Effective Date.


SERVICE PROVIDER:

Signature: _________________________________________

Printed Name: ${provider}

Title: _________________________________________

Date: _________________________________________


CLIENT:

Signature: _________________________________________

Printed Name: ${client}

Title: _________________________________________

Date: _________________________________________


═══════════════════════════════════════════════════════════════════════════════
This document was generated by PearSign Document Center.
Please consult with a qualified legal professional before use.
═══════════════════════════════════════════════════════════════════════════════`;
}

/**
 * Generate Employment Contract
 */
function generateEmploymentContract({ answers, today }: DocumentTemplateParams): string {
  const employer = answers["What is the employer's company name?"] || "[EMPLOYER NAME]";
  const employee = answers["What is the employee's full name?"] || "[EMPLOYEE NAME]";
  const position = answers["What is the job title and responsibilities?"] || "[Job title and responsibilities]";
  const compensation = answers["What is the salary and benefits package?"] || "[Salary and benefits details]";

  return `EMPLOYMENT CONTRACT

Effective Date: ${today}

This Employment Contract (the "Agreement") is entered into as of the Effective Date by and between:

═══════════════════════════════════════════════════════════════════════════════

                                    PARTIES

═══════════════════════════════════════════════════════════════════════════════

EMPLOYER:
Company Name: ${employer}
(hereinafter referred to as the "Employer" or "Company")

EMPLOYEE:
Name: ${employee}
(hereinafter referred to as the "Employee")

═══════════════════════════════════════════════════════════════════════════════

                                   RECITALS

═══════════════════════════════════════════════════════════════════════════════

WHEREAS, the Employer desires to employ the Employee on the terms and conditions set forth herein;

WHEREAS, the Employee desires to be employed by the Employer on such terms and conditions;

NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the parties agree as follows:

═══════════════════════════════════════════════════════════════════════════════

                      ARTICLE 1 - POSITION AND DUTIES

═══════════════════════════════════════════════════════════════════════════════

1.1 POSITION: The Employer hereby employs the Employee, and the Employee hereby accepts employment, in the following position:

${position}

1.2 DUTIES: The Employee shall perform all duties and responsibilities associated with the position, as well as any additional duties that may be reasonably assigned by the Employer from time to time.

1.3 BEST EFFORTS: The Employee agrees to devote their full time, attention, and best efforts to the performance of their duties and to the advancement of the Employer's business interests.

1.4 COMPLIANCE: The Employee agrees to comply with all applicable laws, regulations, and Company policies and procedures.

1.5 REPORTING: The Employee shall report to the designated supervisor or manager as determined by the Employer.

═══════════════════════════════════════════════════════════════════════════════

                          ARTICLE 2 - COMPENSATION

═══════════════════════════════════════════════════════════════════════════════

2.1 BASE SALARY AND BENEFITS: In consideration for the Employee's services, the Employer agrees to provide the following compensation and benefits:

${compensation}

2.2 PAYMENT: Salary shall be paid in accordance with the Employer's standard payroll practices, subject to applicable tax withholdings and deductions.

2.3 EXPENSE REIMBURSEMENT: The Employer shall reimburse the Employee for all reasonable, pre-approved business expenses incurred in the performance of duties, upon submission of appropriate documentation.

2.4 BENEFITS: The Employee shall be eligible to participate in the Employer's benefit programs in accordance with the terms and conditions of such programs.

2.5 ANNUAL REVIEW: The Employee's compensation may be reviewed annually by the Employer, and any adjustments shall be at the sole discretion of the Employer.

═══════════════════════════════════════════════════════════════════════════════

                       ARTICLE 3 - TERM AND TERMINATION

═══════════════════════════════════════════════════════════════════════════════

3.1 EMPLOYMENT TERM: This employment shall be "at-will," meaning that either party may terminate the employment relationship at any time, with or without cause, and with or without notice, except as otherwise required by law.

3.2 TERMINATION BY EMPLOYER: The Employer may terminate this Agreement at any time for any reason or no reason.

3.3 TERMINATION BY EMPLOYEE: The Employee may resign at any time by providing written notice to the Employer. The Employee agrees to provide at least two (2) weeks' advance notice of resignation.

3.4 TERMINATION FOR CAUSE: The Employer may terminate this Agreement immediately for cause, including but not limited to: (a) material breach of this Agreement; (b) dishonesty or fraud; (c) conviction of a felony; (d) willful misconduct; (e) failure to perform duties; or (f) violation of Company policies.

3.5 EFFECT OF TERMINATION: Upon termination of employment:

    (a) The Employee shall be entitled to receive all earned but unpaid compensation through the date of termination;

    (b) The Employee shall return all Company property, including but not limited to keys, equipment, documents, and Confidential Information;

    (c) Provisions of this Agreement that by their nature should survive termination shall remain in full force and effect.

═══════════════════════════════════════════════════════════════════════════════

                          ARTICLE 4 - CONFIDENTIALITY

═══════════════════════════════════════════════════════════════════════════════

4.1 CONFIDENTIAL INFORMATION: During the course of employment, the Employee may have access to confidential and proprietary information of the Employer, including but not limited to: trade secrets, business plans, customer lists, financial information, marketing strategies, technical data, and other proprietary information (collectively, "Confidential Information").

4.2 NON-DISCLOSURE: The Employee agrees to hold all Confidential Information in strict confidence and shall not disclose any Confidential Information to any third party without the prior written consent of the Employer.

4.3 LIMITED USE: The Employee shall use Confidential Information solely for the benefit of the Employer and in the performance of their duties.

4.4 RETURN OF MATERIALS: Upon termination of employment or upon request by the Employer, the Employee shall immediately return all Confidential Information and any copies thereof.

4.5 SURVIVAL: The confidentiality obligations set forth in this Article shall survive the termination of employment indefinitely.

═══════════════════════════════════════════════════════════════════════════════

                       ARTICLE 5 - INTELLECTUAL PROPERTY

═══════════════════════════════════════════════════════════════════════════════

5.1 WORK PRODUCT: All inventions, discoveries, improvements, ideas, designs, processes, techniques, works of authorship, and other work product created, conceived, or developed by the Employee during the course of employment or using Employer resources (collectively, "Work Product") shall be the sole and exclusive property of the Employer.

5.2 ASSIGNMENT: The Employee hereby assigns to the Employer all right, title, and interest in and to the Work Product, including all intellectual property rights therein.

5.3 COOPERATION: The Employee agrees to execute any documents and take any actions reasonably necessary to perfect the Employer's rights in the Work Product.

═══════════════════════════════════════════════════════════════════════════════

                        ARTICLE 6 - NON-COMPETITION

═══════════════════════════════════════════════════════════════════════════════

6.1 NON-COMPETITION: During the term of employment and for a period of twelve (12) months following termination of employment, the Employee agrees not to engage in any business that competes with the Employer's business within a reasonable geographic area.

6.2 NON-SOLICITATION: During the term of employment and for a period of twelve (12) months following termination of employment, the Employee agrees not to:

    (a) Solicit or attempt to solicit any customers, clients, or business partners of the Employer;

    (b) Solicit or attempt to solicit any employees of the Employer to leave their employment.

6.3 REASONABLENESS: The Employee acknowledges that the restrictions in this Article are reasonable and necessary to protect the Employer's legitimate business interests.

═══════════════════════════════════════════════════════════════════════════════

                        ARTICLE 7 - GENERAL PROVISIONS

═══════════════════════════════════════════════════════════════════════════════

7.1 ENTIRE AGREEMENT: This Agreement constitutes the entire agreement between the parties concerning the subject matter hereof and supersedes all prior agreements, negotiations, and understandings.

7.2 AMENDMENTS: This Agreement may not be amended or modified except by a written instrument signed by both parties.

7.3 SEVERABILITY: If any provision of this Agreement is held to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.

7.4 GOVERNING LAW: This Agreement shall be governed by and construed in accordance with the laws of the applicable jurisdiction.

7.5 NOTICES: All notices shall be in writing and delivered to the addresses set forth above.

7.6 COUNTERPARTS: This Agreement may be executed in counterparts, each of which shall be deemed an original.

═══════════════════════════════════════════════════════════════════════════════

                                  SIGNATURES

═══════════════════════════════════════════════════════════════════════════════

IN WITNESS WHEREOF, the parties have executed this Employment Contract as of the Effective Date.


EMPLOYER:

Signature: _________________________________________

Company: ${employer}

Printed Name: _________________________________________

Title: _________________________________________

Date: _________________________________________


EMPLOYEE:

Signature: _________________________________________

Printed Name: ${employee}

Date: _________________________________________


═══════════════════════════════════════════════════════════════════════════════
This document was generated by PearSign Document Center.
Please consult with a qualified legal professional before use.
═══════════════════════════════════════════════════════════════════════════════`;
}

/**
 * Generate Partnership Agreement
 */
function generatePartnershipAgreement({ answers, today }: DocumentTemplateParams): string {
  const partners = answers["What are the names of all partners?"] || "[PARTNER NAMES]";
  const business = answers["What is the nature of the business?"] || "[Business description]";
  const profitSharing = answers["How will profits and losses be shared?"] || "[Profit and loss sharing arrangement]";
  const responsibilities = answers["What are each partner's responsibilities?"] || "[Partner responsibilities]";

  return `PARTNERSHIP AGREEMENT

Effective Date: ${today}

This Partnership Agreement (the "Agreement") is entered into by and among the following parties:

═══════════════════════════════════════════════════════════════════════════════

                                    PARTIES

═══════════════════════════════════════════════════════════════════════════════

PARTNERS:
${partners}

(hereinafter collectively referred to as the "Partners" and individually as a "Partner")

═══════════════════════════════════════════════════════════════════════════════

                           ARTICLE 1 - FORMATION

═══════════════════════════════════════════════════════════════════════════════

1.1 FORMATION: The Partners hereby form a general partnership (the "Partnership") pursuant to the laws of the applicable jurisdiction.

1.2 NAME: The Partnership shall conduct business under the name agreed upon by the Partners.

1.3 PRINCIPAL PLACE OF BUSINESS: The principal place of business shall be at a location determined by the Partners.

1.4 BUSINESS PURPOSE: The Partnership is formed for the following purpose:

${business}

═══════════════════════════════════════════════════════════════════════════════

                     ARTICLE 2 - CAPITAL CONTRIBUTIONS

═══════════════════════════════════════════════════════════════════════════════

2.1 INITIAL CONTRIBUTIONS: Each Partner shall contribute capital to the Partnership as agreed upon by the Partners.

2.2 ADDITIONAL CONTRIBUTIONS: Additional capital contributions may be required upon unanimous consent of all Partners.

2.3 CAPITAL ACCOUNTS: The Partnership shall maintain a separate capital account for each Partner.

═══════════════════════════════════════════════════════════════════════════════

                     ARTICLE 3 - PROFITS AND LOSSES

═══════════════════════════════════════════════════════════════════════════════

3.1 ALLOCATION: Profits and losses of the Partnership shall be allocated as follows:

${profitSharing}

3.2 DISTRIBUTIONS: Distributions shall be made at times and in amounts determined by the Partners.

═══════════════════════════════════════════════════════════════════════════════

                   ARTICLE 4 - MANAGEMENT AND DUTIES

═══════════════════════════════════════════════════════════════════════════════

4.1 MANAGEMENT: The Partnership shall be managed by all Partners jointly.

4.2 RESPONSIBILITIES: Each Partner shall have the following responsibilities:

${responsibilities}

4.3 VOTING: Each Partner shall have one vote, and decisions shall be made by majority vote unless otherwise specified.

4.4 FIDUCIARY DUTIES: Each Partner owes fiduciary duties to the Partnership and to the other Partners.

═══════════════════════════════════════════════════════════════════════════════

                            ARTICLE 5 - TERM

═══════════════════════════════════════════════════════════════════════════════

5.1 TERM: The Partnership shall continue until dissolved in accordance with this Agreement.

5.2 DISSOLUTION: The Partnership may be dissolved by unanimous consent of the Partners or as otherwise provided by law.

═══════════════════════════════════════════════════════════════════════════════

                                  SIGNATURES

═══════════════════════════════════════════════════════════════════════════════

IN WITNESS WHEREOF, the Partners have executed this Partnership Agreement as of the Effective Date.


PARTNER 1:

Signature: _________________________________________

Printed Name: _________________________________________

Date: _________________________________________


PARTNER 2:

Signature: _________________________________________

Printed Name: _________________________________________

Date: _________________________________________


═══════════════════════════════════════════════════════════════════════════════
This document was generated by PearSign Document Center.
Please consult with a qualified legal professional before use.
═══════════════════════════════════════════════════════════════════════════════`;
}

/**
 * Generate Rental/Lease Agreement
 */
function generateRentalAgreement({ answers, today }: DocumentTemplateParams): string {
  const landlord = answers["What is the landlord's name?"] || "[LANDLORD NAME]";
  const tenant = answers["What is the tenant's name?"] || "[TENANT NAME]";
  const property = answers["What is the property address?"] || "[Property address]";
  const terms = answers["What is the monthly rent and lease duration?"] || "[Rent amount and lease duration]";

  return `RESIDENTIAL LEASE AGREEMENT

Effective Date: ${today}

This Residential Lease Agreement (the "Lease" or "Agreement") is entered into by and between:

═══════════════════════════════════════════════════════════════════════════════

                                    PARTIES

═══════════════════════════════════════════════════════════════════════════════

LANDLORD:
Name: ${landlord}
(hereinafter referred to as the "Landlord")

TENANT:
Name: ${tenant}
(hereinafter referred to as the "Tenant")

═══════════════════════════════════════════════════════════════════════════════

                              ARTICLE 1 - PROPERTY

═══════════════════════════════════════════════════════════════════════════════

1.1 PREMISES: The Landlord agrees to lease to the Tenant, and the Tenant agrees to lease from the Landlord, the following premises:

Address: ${property}

1.2 CONDITION: The Tenant acknowledges that the premises are in good and habitable condition.

═══════════════════════════════════════════════════════════════════════════════

                          ARTICLE 2 - TERM AND RENT

═══════════════════════════════════════════════════════════════════════════════

2.1 LEASE TERM AND MONTHLY RENT:

${terms}

2.2 PAYMENT: Rent shall be due on the first day of each month. Late payments shall incur a late fee.

2.3 SECURITY DEPOSIT: Tenant shall pay a security deposit equal to one month's rent.

═══════════════════════════════════════════════════════════════════════════════

                      ARTICLE 3 - TENANT OBLIGATIONS

═══════════════════════════════════════════════════════════════════════════════

3.1 USE: Tenant shall use the premises only for residential purposes.

3.2 MAINTENANCE: Tenant shall maintain the premises in good condition.

3.3 RULES: Tenant shall comply with all applicable laws, regulations, and community rules.

═══════════════════════════════════════════════════════════════════════════════

                      ARTICLE 4 - LANDLORD OBLIGATIONS

═══════════════════════════════════════════════════════════════════════════════

4.1 REPAIRS: Landlord shall make necessary repairs to keep the premises habitable.

4.2 QUIET ENJOYMENT: Landlord shall not interfere with Tenant's quiet enjoyment of the premises.

═══════════════════════════════════════════════════════════════════════════════

                                  SIGNATURES

═══════════════════════════════════════════════════════════════════════════════

IN WITNESS WHEREOF, the parties have executed this Lease Agreement as of the Effective Date.


LANDLORD:

Signature: _________________________________________

Printed Name: ${landlord}

Date: _________________________________________


TENANT:

Signature: _________________________________________

Printed Name: ${tenant}

Date: _________________________________________


═══════════════════════════════════════════════════════════════════════════════
This document was generated by PearSign Document Center.
Please consult with a qualified legal professional before use.
═══════════════════════════════════════════════════════════════════════════════`;
}

/**
 * Generate Consulting Agreement
 */
function generateConsultingAgreement({ answers, today }: DocumentTemplateParams): string {
  const consultant = answers["What is the consultant's name or company?"] || "[CONSULTANT NAME]";
  const client = answers["What is the client's name?"] || "[CLIENT NAME]";
  const services = answers["What consulting services will be provided?"] || "[Consulting services description]";
  const timeline = answers["What is the project timeline and deliverables?"] || "[Timeline and deliverables]";

  return `CONSULTING AGREEMENT

Effective Date: ${today}

This Consulting Agreement (the "Agreement") is entered into by and between:

═══════════════════════════════════════════════════════════════════════════════

                                    PARTIES

═══════════════════════════════════════════════════════════════════════════════

CONSULTANT:
Name: ${consultant}
(hereinafter referred to as the "Consultant")

CLIENT:
Name: ${client}
(hereinafter referred to as the "Client")

═══════════════════════════════════════════════════════════════════════════════

                         ARTICLE 1 - CONSULTING SERVICES

═══════════════════════════════════════════════════════════════════════════════

1.1 SCOPE: The Consultant agrees to provide the following consulting services:

${services}

1.2 TIMELINE AND DELIVERABLES:

${timeline}

1.3 STANDARDS: All services shall be performed in a professional manner.

═══════════════════════════════════════════════════════════════════════════════

                          ARTICLE 2 - COMPENSATION

═══════════════════════════════════════════════════════════════════════════════

2.1 FEES: Client agrees to pay Consultant fees as agreed upon by the parties.

2.2 EXPENSES: Client shall reimburse Consultant for pre-approved expenses.

═══════════════════════════════════════════════════════════════════════════════

                     ARTICLE 3 - INDEPENDENT CONTRACTOR

═══════════════════════════════════════════════════════════════════════════════

3.1 STATUS: Consultant is an independent contractor, not an employee.

3.2 TAXES: Consultant is responsible for all applicable taxes.

═══════════════════════════════════════════════════════════════════════════════

                          ARTICLE 4 - CONFIDENTIALITY

═══════════════════════════════════════════════════════════════════════════════

4.1 CONFIDENTIAL INFORMATION: Consultant shall maintain confidentiality of all proprietary information.

4.2 NON-DISCLOSURE: Consultant shall not disclose confidential information to third parties.

═══════════════════════════════════════════════════════════════════════════════

                                  SIGNATURES

═══════════════════════════════════════════════════════════════════════════════

IN WITNESS WHEREOF, the parties have executed this Consulting Agreement.


CONSULTANT:

Signature: _________________________________________

Printed Name: ${consultant}

Date: _________________________________________


CLIENT:

Signature: _________________________________________

Printed Name: ${client}

Date: _________________________________________


═══════════════════════════════════════════════════════════════════════════════
This document was generated by PearSign Document Center.
Please consult with a qualified legal professional before use.
═══════════════════════════════════════════════════════════════════════════════`;
}

/**
 * Generate Power of Attorney
 */
function generatePowerOfAttorney({ answers, today }: DocumentTemplateParams): string {
  const principal = answers["What is the principal's full legal name (person granting power)?"] || "[PRINCIPAL NAME]";
  const agent = answers["What is the agent's full legal name (person receiving power)?"] || "[AGENT NAME]";
  const powers = answers["What specific powers are being granted?"] || "[Specific powers to be granted]";
  const durable = answers["Is this a durable power of attorney (remains valid if principal becomes incapacitated)?"] || "Yes";

  return `POWER OF ATTORNEY

Date: ${today}

═══════════════════════════════════════════════════════════════════════════════

                             KNOW ALL PERSONS BY THESE PRESENTS

═══════════════════════════════════════════════════════════════════════════════

I, ${principal} (the "Principal"), hereby appoint ${agent} (the "Agent" or "Attorney-in-Fact") to act as my true and lawful attorney-in-fact.

═══════════════════════════════════════════════════════════════════════════════

                              ARTICLE 1 - GRANT OF POWERS

═══════════════════════════════════════════════════════════════════════════════

1.1 I grant my Agent the following powers to act on my behalf:

${powers}

1.2 My Agent is authorized to execute any documents, sign any papers, and take any actions necessary to carry out the powers granted herein.

═══════════════════════════════════════════════════════════════════════════════

                              ARTICLE 2 - DURABILITY

═══════════════════════════════════════════════════════════════════════════════

2.1 DURABLE POWER: ${durable === "Yes" || durable.toLowerCase().includes("yes") ? "This Power of Attorney shall not be affected by my subsequent disability or incapacity. This is a Durable Power of Attorney." : "This Power of Attorney shall terminate upon my disability or incapacity."}

═══════════════════════════════════════════════════════════════════════════════

                           ARTICLE 3 - REVOCATION

═══════════════════════════════════════════════════════════════════════════════

3.1 I reserve the right to revoke this Power of Attorney at any time by providing written notice to my Agent.

═══════════════════════════════════════════════════════════════════════════════

                                  SIGNATURES

═══════════════════════════════════════════════════════════════════════════════

IN WITNESS WHEREOF, I have executed this Power of Attorney.


PRINCIPAL:

Signature: _________________________________________

Printed Name: ${principal}

Date: _________________________________________


WITNESS 1:

Signature: _________________________________________

Printed Name: _________________________________________

Date: _________________________________________


WITNESS 2:

Signature: _________________________________________

Printed Name: _________________________________________

Date: _________________________________________


NOTARY PUBLIC (if required):

State of: _________________________________________

County of: _________________________________________

On this _____ day of ____________, 20___, before me personally appeared ${principal}, known to me to be the person whose name is subscribed to the within instrument.

Notary Signature: _________________________________________

My Commission Expires: _________________________________________


═══════════════════════════════════════════════════════════════════════════════
This document was generated by PearSign Document Center.
Please consult with a qualified legal professional before use.
═══════════════════════════════════════════════════════════════════════════════`;
}

/**
 * Generate Terms of Service
 */
function generateTermsOfService({ answers, today }: DocumentTemplateParams): string {
  const company = answers["What is the company or website name?"] || "[COMPANY NAME]";
  const serviceType = answers["What type of service or product do you offer?"] || "[Service or product description]";
  const userObligations = answers["What are the key user obligations and restrictions?"] || "[User obligations and restrictions]";
  const liabilityPolicy = answers["What is your liability limitation policy?"] || "[Liability limitation policy]";

  return `TERMS OF SERVICE

Last Updated: ${today}

═══════════════════════════════════════════════════════════════════════════════

                              TERMS OF SERVICE FOR
                                  ${company.toUpperCase()}

═══════════════════════════════════════════════════════════════════════════════

Please read these Terms of Service ("Terms") carefully before using the services provided by ${company} ("Company," "we," "us," or "our").

By accessing or using our services, you agree to be bound by these Terms.

═══════════════════════════════════════════════════════════════════════════════

                           ARTICLE 1 - SERVICES

═══════════════════════════════════════════════════════════════════════════════

1.1 DESCRIPTION: ${company} provides the following services:

${serviceType}

1.2 MODIFICATIONS: We reserve the right to modify, suspend, or discontinue our services at any time.

═══════════════════════════════════════════════════════════════════════════════

                         ARTICLE 2 - USER ACCOUNTS

═══════════════════════════════════════════════════════════════════════════════

2.1 REGISTRATION: You may be required to create an account to access certain features.

2.2 ACCOUNT SECURITY: You are responsible for maintaining the confidentiality of your account credentials.

2.3 ACCURATE INFORMATION: You agree to provide accurate and complete information.

═══════════════════════════════════════════════════════════════════════════════

                   ARTICLE 3 - USER OBLIGATIONS AND RESTRICTIONS

═══════════════════════════════════════════════════════════════════════════════

3.1 USER RESPONSIBILITIES: When using our services, you agree to:

${userObligations}

3.2 PROHIBITED ACTIVITIES: You may not use our services for any illegal or unauthorized purpose.

═══════════════════════════════════════════════════════════════════════════════

                      ARTICLE 4 - INTELLECTUAL PROPERTY

═══════════════════════════════════════════════════════════════════════════════

4.1 OWNERSHIP: All content, features, and functionality of our services are owned by ${company} and are protected by intellectual property laws.

4.2 LIMITED LICENSE: We grant you a limited, non-exclusive license to access and use our services for personal, non-commercial purposes.

═══════════════════════════════════════════════════════════════════════════════

                     ARTICLE 5 - LIMITATION OF LIABILITY

═══════════════════════════════════════════════════════════════════════════════

5.1 LIABILITY POLICY:

${liabilityPolicy}

5.2 DISCLAIMER: OUR SERVICES ARE PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.

5.3 LIMITATION: IN NO EVENT SHALL ${company.toUpperCase()} BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.

═══════════════════════════════════════════════════════════════════════════════

                           ARTICLE 6 - TERMINATION

═══════════════════════════════════════════════════════════════════════════════

6.1 TERMINATION BY USER: You may terminate your account at any time.

6.2 TERMINATION BY COMPANY: We may terminate or suspend your account for violation of these Terms.

═══════════════════════════════════════════════════════════════════════════════

                         ARTICLE 7 - GOVERNING LAW

═══════════════════════════════════════════════════════════════════════════════

7.1 These Terms shall be governed by and construed in accordance with applicable laws.

7.2 Any disputes shall be resolved through binding arbitration or in the courts of the applicable jurisdiction.

═══════════════════════════════════════════════════════════════════════════════

                            ARTICLE 8 - CONTACT

═══════════════════════════════════════════════════════════════════════════════

If you have any questions about these Terms, please contact us at:

${company}
[Contact Information]


═══════════════════════════════════════════════════════════════════════════════
This document was generated by PearSign Document Center.
Please consult with a qualified legal professional before use.
═══════════════════════════════════════════════════════════════════════════════`;
}

/**
 * Generate Privacy Policy
 */
function generatePrivacyPolicy({ answers, today }: DocumentTemplateParams): string {
  const company = answers["What is the company or website name?"] || "[COMPANY NAME]";
  const dataCollected = answers["What personal data do you collect from users?"] || "[Types of data collected]";
  const dataUsage = answers["How is the data used and stored?"] || "[Data usage and storage practices]";
  const thirdPartySharing = answers["Do you share data with third parties?"] || "[Third-party sharing practices]";

  return `PRIVACY POLICY

Last Updated: ${today}

═══════════════════════════════════════════════════════════════════════════════

                              PRIVACY POLICY FOR
                                  ${company.toUpperCase()}

═══════════════════════════════════════════════════════════════════════════════

${company} ("Company," "we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information.

═══════════════════════════════════════════════════════════════════════════════

                    ARTICLE 1 - INFORMATION WE COLLECT

═══════════════════════════════════════════════════════════════════════════════

1.1 PERSONAL DATA: We may collect the following personal information:

${dataCollected}

1.2 AUTOMATICALLY COLLECTED DATA: We may automatically collect certain information when you visit our website, including IP address, browser type, and usage data.

═══════════════════════════════════════════════════════════════════════════════

                   ARTICLE 2 - HOW WE USE YOUR INFORMATION

═══════════════════════════════════════════════════════════════════════════════

2.1 DATA USAGE AND STORAGE:

${dataUsage}

2.2 PURPOSES: We use your information to provide and improve our services, communicate with you, and comply with legal obligations.

═══════════════════════════════════════════════════════════════════════════════

                     ARTICLE 3 - SHARING YOUR INFORMATION

═══════════════════════════════════════════════════════════════════════════════

3.1 THIRD-PARTY SHARING:

${thirdPartySharing}

3.2 We do not sell your personal information to third parties.

═══════════════════════════════════════════════════════════════════════════════

                          ARTICLE 4 - DATA SECURITY

═══════════════════════════════════════════════════════════════════════════════

4.1 SECURITY MEASURES: We implement appropriate technical and organizational security measures to protect your personal information.

4.2 NO GUARANTEE: While we strive to protect your information, no method of transmission over the Internet is 100% secure.

═══════════════════════════════════════════════════════════════════════════════

                           ARTICLE 5 - YOUR RIGHTS

═══════════════════════════════════════════════════════════════════════════════

5.1 ACCESS AND CORRECTION: You have the right to access and correct your personal information.

5.2 DELETION: You may request deletion of your personal information, subject to certain exceptions.

5.3 OPT-OUT: You may opt out of receiving marketing communications from us.

═══════════════════════════════════════════════════════════════════════════════

                       ARTICLE 6 - COOKIES AND TRACKING

═══════════════════════════════════════════════════════════════════════════════

6.1 COOKIES: We use cookies and similar tracking technologies to enhance your experience.

6.2 COOKIE MANAGEMENT: You can manage your cookie preferences through your browser settings.

═══════════════════════════════════════════════════════════════════════════════

                       ARTICLE 7 - CHANGES TO THIS POLICY

═══════════════════════════════════════════════════════════════════════════════

7.1 We may update this Privacy Policy from time to time. We will notify you of any material changes.

═══════════════════════════════════════════════════════════════════════════════

                            ARTICLE 8 - CONTACT US

═══════════════════════════════════════════════════════════════════════════════

If you have any questions about this Privacy Policy, please contact us at:

${company}
[Contact Information]


═══════════════════════════════════════════════════════════════════════════════
This document was generated by PearSign Document Center.
Please consult with a qualified legal professional before use.
═══════════════════════════════════════════════════════════════════════════════`;
}

/**
 * Generate Vehicle Sale Agreement
 */
function generateVehicleSaleAgreement({ answers, today }: DocumentTemplateParams): string {
  const seller = answers["What is the seller's full name?"] || "[SELLER NAME]";
  const buyer = answers["What is the buyer's full name?"] || "[BUYER NAME]";
  const vehicleInfo = answers["What is the vehicle make, model, year, and VIN?"] || "[Vehicle make, model, year, and VIN]";
  const salePrice = answers["What is the sale price and payment terms?"] || "[Sale price and payment terms]";

  return `VEHICLE SALE AGREEMENT

Date: ${today}

═══════════════════════════════════════════════════════════════════════════════

                            BILL OF SALE / VEHICLE SALE AGREEMENT

═══════════════════════════════════════════════════════════════════════════════

This Vehicle Sale Agreement (the "Agreement") is entered into by and between:

SELLER:
Name: ${seller}
(hereinafter referred to as the "Seller")

BUYER:
Name: ${buyer}
(hereinafter referred to as the "Buyer")

═══════════════════════════════════════════════════════════════════════════════

                            ARTICLE 1 - VEHICLE INFORMATION

═══════════════════════════════════════════════════════════════════════════════

1.1 VEHICLE DESCRIPTION: The Seller agrees to sell, and the Buyer agrees to purchase, the following vehicle:

${vehicleInfo}

1.2 ODOMETER READING: The odometer reading at the time of sale is: _____________ miles.

1.3 CONDITION: The Buyer acknowledges inspecting the vehicle and accepts it in its current "AS IS" condition.

═══════════════════════════════════════════════════════════════════════════════

                          ARTICLE 2 - PURCHASE PRICE

═══════════════════════════════════════════════════════════════════════════════

2.1 SALE PRICE AND PAYMENT:

${salePrice}

2.2 The Buyer agrees to pay the full purchase price upon execution of this Agreement unless otherwise specified above.

═══════════════════════════════════════════════════════════════════════════════

                        ARTICLE 3 - TRANSFER OF TITLE

═══════════════════════════════════════════════════════════════════════════════

3.1 TITLE TRANSFER: Upon receipt of full payment, the Seller shall transfer the certificate of title to the Buyer.

3.2 REGISTRATION: The Buyer is responsible for registering the vehicle in their name.

3.3 LIENS: The Seller warrants that the vehicle is free and clear of all liens and encumbrances.

═══════════════════════════════════════════════════════════════════════════════

                       ARTICLE 4 - WARRANTIES AND DISCLAIMERS

═══════════════════════════════════════════════════════════════════════════════

4.1 AS-IS SALE: THE VEHICLE IS SOLD "AS IS" WITHOUT ANY WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.

4.2 SELLER REPRESENTATIONS: The Seller represents that:
    (a) They have the legal right to sell the vehicle;
    (b) The odometer reading is accurate to the best of their knowledge;
    (c) The vehicle is free of liens and encumbrances.

═══════════════════════════════════════════════════════════════════════════════

                                  SIGNATURES

═══════════════════════════════════════════════════════════════════════════════

By signing below, both parties agree to the terms of this Vehicle Sale Agreement.


SELLER:

Signature: _________________________________________

Printed Name: ${seller}

Address: _________________________________________

Date: _________________________________________


BUYER:

Signature: _________________________________________

Printed Name: ${buyer}

Address: _________________________________________

Date: _________________________________________


═══════════════════════════════════════════════════════════════════════════════
This document was generated by PearSign Document Center.
Please consult with a qualified legal professional before use.
═══════════════════════════════════════════════════════════════════════════════`;
}

// Export template generation functions
export const DOCUMENT_TEMPLATES: Record<string, (params: DocumentTemplateParams) => string> = {
  nda: generateNDA,
  service: generateServiceAgreement,
  employment: generateEmploymentContract,
  partnership: generatePartnershipAgreement,
  rental: generateRentalAgreement,
  consulting: generateConsultingAgreement,
  poa: generatePowerOfAttorney,
  tos: generateTermsOfService,
  privacy: generatePrivacyPolicy,
  vehicle: generateVehicleSaleAgreement,
};

/**
 * Get template generator by document type ID
 */
export function getTemplateGenerator(typeId: string): ((params: DocumentTemplateParams) => string) | null {
  return DOCUMENT_TEMPLATES[typeId] || null;
}

/**
 * Generate a document using the appropriate template
 */
export function generateDocument(typeId: string, answers: Record<string, string>): string {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const generator = getTemplateGenerator(typeId);
  if (generator) {
    return generator({ answers, today });
  }

  // Fallback for types without templates
  return `Document type "${typeId}" template is not yet available.`;
}
