--
-- PostgreSQL database dump
--

\restrict ZXvC5xbkzuplqcOQri44Z3O874weZbAsO42gSyu7pGnjRHMIXdrmjVEXMDBbbmG

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

-- Started on 2026-11-16 15:14:05

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 5151 (class 1262 OID 16388)
-- Name: education-system-based-on-dify; Type: DATABASE; Schema: -; Owner: -
--

CREATE DATABASE "education-system-based-on-dify" WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'Chinese (Simplified)_China.utf8';


\unrestrict ZXvC5xbkzuplqcOQri44Z3O874weZbAsO42gSyu7pGnjRHMIXdrmjVEXMDBbbmG
\encoding SQL_ASCII
\connect -reuse-previous=on "dbname='education-system-based-on-dify'"
\restrict ZXvC5xbkzuplqcOQri44Z3O874weZbAsO42gSyu7pGnjRHMIXdrmjVEXMDBbbmG

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 224 (class 1259 OID 34481)
-- Name: administrators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.administrators (
    id text NOT NULL,
    username text NOT NULL,
    display_name text NOT NULL,
    password_hash text NOT NULL,
    active integer DEFAULT 1 NOT NULL,
    session_token_hash text,
    session_expires_at text,
    created_at text NOT NULL,
    last_active_at text NOT NULL,
    CONSTRAINT administrators_active_check CHECK ((active = ANY (ARRAY[0, 1]))),
    CONSTRAINT administrators_check CHECK (((session_token_hash IS NULL) = (session_expires_at IS NULL)))
);


--
-- TOC entry 226 (class 1259 OID 77445)
-- Name: course_chapters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_chapters (
    course_id text NOT NULL,
    sort_order integer CONSTRAINT course_chapters_stage_not_null NOT NULL,
    title text NOT NULL,
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    CONSTRAINT course_chapters_stage_check CHECK ((sort_order > 0)),
    CONSTRAINT course_chapters_title_check CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 100)))
);


--
-- TOC entry 222 (class 1259 OID 16763)
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courses (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    title text NOT NULL,
    active integer DEFAULT 1 NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"'::text) NOT NULL,
    updated_at text DEFAULT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"'::text) NOT NULL,
    graph_color text DEFAULT (ARRAY['#2563eb'::text, '#c2410c'::text, '#047857'::text, '#9333ea'::text, '#be185d'::text, '#0e7490'::text, '#a16207'::text, '#475569'::text])[(1 + (floor((random() * (8)::double precision)))::integer)] NOT NULL,
    completion_threshold double precision DEFAULT 80 NOT NULL,
    dify_api_base_url text DEFAULT 'https://api.dify.ai/v1'::text NOT NULL,
    dify_api_key_encrypted text,
    dify_credential_id text,
    CONSTRAINT courses_active_check CHECK ((active = ANY (ARRAY[0, 1]))),
    CONSTRAINT courses_completion_threshold_check CHECK (((completion_threshold >= (0)::double precision) AND (completion_threshold <= (100)::double precision))),
    CONSTRAINT courses_graph_color_check CHECK ((graph_color ~ '^#[0-9a-f]{6}$'::text))
);


--
-- TOC entry 220 (class 1259 OID 16410)
-- Name: curriculum_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.curriculum_topics (
    id text NOT NULL,
    course text NOT NULL,
    title text NOT NULL,
    order_index integer NOT NULL,
    description text NOT NULL,
    learning_objectives_json text NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    chapter_id text NOT NULL,
    CONSTRAINT curriculum_topics_order_index_check CHECK ((order_index > 0))
);


--
-- TOC entry 229 (class 1259 OID 87955)
-- Name: dify_call_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dify_call_logs (
    id text NOT NULL,
    request_id text NOT NULL,
    credential_id text,
    student_id text,
    course_id text,
    topic_id text,
    business_type text NOT NULL,
    is_anonymous boolean NOT NULL,
    started_at timestamp with time zone NOT NULL,
    finished_at timestamp with time zone,
    duration_ms bigint,
    status text NOT NULL,
    error_code text,
    http_status integer,
    conversation_id text,
    message_id text,
    task_id text,
    workflow_run_id text,
    prompt_tokens bigint,
    completion_tokens bigint,
    total_tokens bigint,
    total_price numeric,
    currency text,
    CONSTRAINT dify_call_logs_business_type_check CHECK ((business_type = ANY (ARRAY['free_qa'::text, 'topic_teaching'::text, 'topic_clarification'::text, 'topic_practice'::text, 'topic_answer'::text, 'diagnosis'::text]))),
    CONSTRAINT dify_call_logs_check CHECK ((is_anonymous = (student_id IS NULL))),
    CONSTRAINT dify_call_logs_check1 CHECK ((((status = 'in_progress'::text) AND (finished_at IS NULL) AND (duration_ms IS NULL)) OR ((status <> 'in_progress'::text) AND (finished_at IS NOT NULL) AND (duration_ms IS NOT NULL)))),
    CONSTRAINT dify_call_logs_completion_tokens_check CHECK ((completion_tokens >= 0)),
    CONSTRAINT dify_call_logs_duration_ms_check CHECK ((duration_ms >= 0)),
    CONSTRAINT dify_call_logs_error_code_check CHECK ((error_code = ANY (ARRAY['unexpected_error'::text, 'upstream_error'::text, 'http_error'::text, 'transport_error'::text, 'invalid_response'::text, 'incomplete_response'::text, 'timeout'::text, 'cancelled'::text]))),
    CONSTRAINT dify_call_logs_http_status_check CHECK (((http_status >= 100) AND (http_status <= 599))),
    CONSTRAINT dify_call_logs_prompt_tokens_check CHECK ((prompt_tokens >= 0)),
    CONSTRAINT dify_call_logs_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'succeeded'::text, 'failed'::text, 'timeout'::text, 'cancelled'::text]))),
    CONSTRAINT dify_call_logs_total_price_check CHECK ((total_price >= (0)::numeric)),
    CONSTRAINT dify_call_logs_total_tokens_check CHECK ((total_tokens >= 0))
);


--
-- TOC entry 228 (class 1259 OID 85661)
-- Name: dify_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dify_credentials (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    api_base_url text NOT NULL,
    key_fingerprint text NOT NULL,
    api_key_encrypted text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT dify_credentials_key_fingerprint_check CHECK ((key_fingerprint ~ '^[0-9a-f]{64}$'::text))
);


--
-- TOC entry 227 (class 1259 OID 83662)
-- Name: dify_free_qa_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dify_free_qa_settings (
    id integer NOT NULL,
    api_base_url text DEFAULT 'https://api.dify.ai/v1'::text NOT NULL,
    api_key_encrypted text,
    updated_at text DEFAULT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"'::text) NOT NULL,
    dify_credential_id text,
    CONSTRAINT dify_free_qa_settings_id_check CHECK ((id = 1))
);


--
-- TOC entry 223 (class 1259 OID 17081)
-- Name: student_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_sessions (
    id text NOT NULL,
    student_id text NOT NULL,
    token_hash text NOT NULL,
    expires_at text NOT NULL,
    created_at text NOT NULL,
    last_used_at text NOT NULL
);


--
-- TOC entry 221 (class 1259 OID 16478)
-- Name: student_topic_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_topic_states (
    student_id text NOT NULL,
    topic_id text NOT NULL,
    mastery real,
    evidence_count integer DEFAULT 0 NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    latest_score real,
    best_score real,
    status text DEFAULT 'not_started'::text NOT NULL,
    started_at text,
    last_practiced_at text,
    mastered_at text,
    updated_at text NOT NULL,
    CONSTRAINT student_topic_states_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT student_topic_states_evidence_count_check CHECK ((evidence_count >= 0)),
    CONSTRAINT student_topic_states_mastery_check CHECK (((mastery >= (0)::double precision) AND (mastery <= (1)::double precision))),
    CONSTRAINT student_topic_states_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'learning'::text, 'mastered'::text])))
);


--
-- TOC entry 219 (class 1259 OID 16400)
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    id text NOT NULL,
    created_at text NOT NULL,
    last_active_at text NOT NULL,
    username text,
    display_name text,
    password_hash text,
    active integer DEFAULT 1 NOT NULL,
    CONSTRAINT students_active_check CHECK ((active = ANY (ARRAY[0, 1])))
);


--
-- TOC entry 225 (class 1259 OID 56028)
-- Name: topic_relations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topic_relations (
    topic_a_id text NOT NULL,
    topic_b_id text NOT NULL,
    relation_type text DEFAULT 'related'::text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT topic_relations_check CHECK ((topic_a_id < topic_b_id)),
    CONSTRAINT topic_relations_relation_type_check CHECK ((relation_type = 'related'::text))
);


--
-- TOC entry 4963 (class 2606 OID 34497)
-- Name: administrators administrators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrators
    ADD CONSTRAINT administrators_pkey PRIMARY KEY (id);


--
-- TOC entry 4965 (class 2606 OID 34501)
-- Name: administrators administrators_session_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrators
    ADD CONSTRAINT administrators_session_token_hash_key UNIQUE (session_token_hash);


--
-- TOC entry 4967 (class 2606 OID 34499)
-- Name: administrators administrators_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrators
    ADD CONSTRAINT administrators_username_key UNIQUE (username);


--
-- TOC entry 4972 (class 2606 OID 83585)
-- Name: course_chapters course_chapters_course_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_chapters
    ADD CONSTRAINT course_chapters_course_order_key UNIQUE (course_id, sort_order) DEFERRABLE INITIALLY DEFERRED;


--
-- TOC entry 4974 (class 2606 OID 83583)
-- Name: course_chapters course_chapters_id_course_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_chapters
    ADD CONSTRAINT course_chapters_id_course_key UNIQUE (id, course_id);


--
-- TOC entry 4976 (class 2606 OID 83581)
-- Name: course_chapters course_chapters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_chapters
    ADD CONSTRAINT course_chapters_pkey PRIMARY KEY (id);


--
-- TOC entry 4957 (class 2606 OID 16774)
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);


--
-- TOC entry 4949 (class 2606 OID 16438)
-- Name: curriculum_topics curriculum_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_topics
    ADD CONSTRAINT curriculum_topics_pkey PRIMARY KEY (id);


--
-- TOC entry 4984 (class 2606 OID 87978)
-- Name: dify_call_logs dify_call_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dify_call_logs
    ADD CONSTRAINT dify_call_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 4980 (class 2606 OID 85677)
-- Name: dify_credentials dify_credentials_api_base_url_key_fingerprint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dify_credentials
    ADD CONSTRAINT dify_credentials_api_base_url_key_fingerprint_key UNIQUE (api_base_url, key_fingerprint);


--
-- TOC entry 4982 (class 2606 OID 85675)
-- Name: dify_credentials dify_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dify_credentials
    ADD CONSTRAINT dify_credentials_pkey PRIMARY KEY (id);


--
-- TOC entry 4978 (class 2606 OID 83674)
-- Name: dify_free_qa_settings dify_free_qa_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dify_free_qa_settings
    ADD CONSTRAINT dify_free_qa_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 4959 (class 2606 OID 17093)
-- Name: student_sessions student_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_sessions
    ADD CONSTRAINT student_sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 4961 (class 2606 OID 17095)
-- Name: student_sessions student_sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_sessions
    ADD CONSTRAINT student_sessions_token_hash_key UNIQUE (token_hash);


--
-- TOC entry 4955 (class 2606 OID 16514)
-- Name: student_topic_states student_topic_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_topic_states
    ADD CONSTRAINT student_topic_states_pkey PRIMARY KEY (student_id, topic_id);


--
-- TOC entry 4945 (class 2606 OID 16409)
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- TOC entry 4947 (class 2606 OID 17077)
-- Name: students students_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_username_key UNIQUE (username);


--
-- TOC entry 4970 (class 2606 OID 56042)
-- Name: topic_relations topic_relations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_relations
    ADD CONSTRAINT topic_relations_pkey PRIMARY KEY (topic_a_id, topic_b_id, relation_type);


--
-- TOC entry 4950 (class 1259 OID 83679)
-- Name: idx_curriculum_topics_chapter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_curriculum_topics_chapter ON public.curriculum_topics USING btree (chapter_id, order_index);


--
-- TOC entry 4951 (class 1259 OID 83680)
-- Name: idx_curriculum_topics_course_chapter_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_curriculum_topics_course_chapter_order ON public.curriculum_topics USING btree (course, chapter_id, order_index);


--
-- TOC entry 4985 (class 1259 OID 87985)
-- Name: idx_dify_call_logs_credential_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dify_call_logs_credential_time ON public.dify_call_logs USING btree (credential_id, started_at DESC);


--
-- TOC entry 4986 (class 1259 OID 87986)
-- Name: idx_dify_call_logs_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dify_call_logs_request ON public.dify_call_logs USING btree (request_id);


--
-- TOC entry 4987 (class 1259 OID 87984)
-- Name: idx_dify_call_logs_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dify_call_logs_time ON public.dify_call_logs USING btree (started_at DESC, id);


--
-- TOC entry 4952 (class 1259 OID 16754)
-- Name: idx_student_topic_states_student_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_topic_states_student_status ON public.student_topic_states USING btree (student_id, status);


--
-- TOC entry 4953 (class 1259 OID 16753)
-- Name: idx_student_topic_states_topic_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_topic_states_topic_status ON public.student_topic_states USING btree (topic_id, status);


--
-- TOC entry 4968 (class 1259 OID 56053)
-- Name: idx_topic_relations_b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_topic_relations_b ON public.topic_relations USING btree (topic_b_id);


--
-- TOC entry 4996 (class 2606 OID 77457)
-- Name: course_chapters course_chapters_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_chapters
    ADD CONSTRAINT course_chapters_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- TOC entry 4992 (class 2606 OID 85678)
-- Name: courses courses_dify_credential_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_dify_credential_id_fkey FOREIGN KEY (dify_credential_id) REFERENCES public.dify_credentials(id);


--
-- TOC entry 4988 (class 2606 OID 83588)
-- Name: curriculum_topics curriculum_topics_chapter_course_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_topics
    ADD CONSTRAINT curriculum_topics_chapter_course_fkey FOREIGN KEY (chapter_id, course) REFERENCES public.course_chapters(id, course_id);


--
-- TOC entry 4989 (class 2606 OID 37583)
-- Name: curriculum_topics curriculum_topics_course_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_topics
    ADD CONSTRAINT curriculum_topics_course_fkey FOREIGN KEY (course) REFERENCES public.courses(id);


--
-- TOC entry 4998 (class 2606 OID 87979)
-- Name: dify_call_logs dify_call_logs_credential_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dify_call_logs
    ADD CONSTRAINT dify_call_logs_credential_id_fkey FOREIGN KEY (credential_id) REFERENCES public.dify_credentials(id);


--
-- TOC entry 4997 (class 2606 OID 85683)
-- Name: dify_free_qa_settings dify_free_qa_settings_dify_credential_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dify_free_qa_settings
    ADD CONSTRAINT dify_free_qa_settings_dify_credential_id_fkey FOREIGN KEY (dify_credential_id) REFERENCES public.dify_credentials(id);


--
-- TOC entry 4993 (class 2606 OID 17096)
-- Name: student_sessions student_sessions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_sessions
    ADD CONSTRAINT student_sessions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- TOC entry 4990 (class 2606 OID 16515)
-- Name: student_topic_states student_topic_states_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_topic_states
    ADD CONSTRAINT student_topic_states_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- TOC entry 4991 (class 2606 OID 16520)
-- Name: student_topic_states student_topic_states_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_topic_states
    ADD CONSTRAINT student_topic_states_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.curriculum_topics(id) ON DELETE CASCADE;


--
-- TOC entry 4994 (class 2606 OID 56043)
-- Name: topic_relations topic_relations_topic_a_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_relations
    ADD CONSTRAINT topic_relations_topic_a_id_fkey FOREIGN KEY (topic_a_id) REFERENCES public.curriculum_topics(id) ON DELETE CASCADE;


--
-- TOC entry 4995 (class 2606 OID 56048)
-- Name: topic_relations topic_relations_topic_b_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_relations
    ADD CONSTRAINT topic_relations_topic_b_id_fkey FOREIGN KEY (topic_b_id) REFERENCES public.curriculum_topics(id) ON DELETE CASCADE;


-- Completed on 2026-11-16 15:14:05

--
-- PostgreSQL database dump complete
--

\unrestrict ZXvC5xbkzuplqcOQri44Z3O874weZbAsO42gSyu7pGnjRHMIXdrmjVEXMDBbbmG

